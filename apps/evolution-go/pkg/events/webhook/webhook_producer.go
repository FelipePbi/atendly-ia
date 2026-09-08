package webhook_producer

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	producer_interfaces "github.com/EvolutionAPI/evolution-go/pkg/events/interfaces"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
)

const (
	defaultMaxAttempts   = 5
	defaultRetryInterval = 30 * time.Second
	defaultResumeLimit   = 100
)

type webhookProducer struct {
	loggerWrapper *logger_wrapper.LoggerManager
	// store guarda a tentativa antes da goroutine de HTTP. Nulo significa
	// entrega sem persistencia: o produtor continua funcionando, mas nada e
	// retomado depois de um restart.
	store DeliveryStore
	// resolveURL redescobre o destino real (com o segredo que o outbox nao
	// guarda) a partir da instancia, na retomada.
	resolveURL    func(instanceID string) (string, error)
	maxAttempts   int
	retryInterval time.Duration
	now           func() time.Time
	// inflight contabiliza as entregas assincronas ja disparadas por Produce.
	// Nao altera politica de retry nem de entrega: existe apenas para que o
	// teste possa esperar de forma deterministica o fim da goroutine antes de
	// fechar o logger da instancia. Sem isso o log de sucesso e escrito depois
	// da resposta HTTP e mantem instance.log aberto no cleanup.
	inflight sync.WaitGroup
}

// Option configura o produtor sem quebrar quem so precisa do logger.
type Option func(*webhookProducer)

// WithDeliveryStore liga o outbox durável.
func WithDeliveryStore(store DeliveryStore) Option {
	return func(p *webhookProducer) { p.store = store }
}

// WithURLResolver ensina o produtor a redescobrir o destino de uma instância na
// retomada, já que o outbox guarda o destino redigido.
func WithURLResolver(resolver func(instanceID string) (string, error)) Option {
	return func(p *webhookProducer) { p.resolveURL = resolver }
}

// WithRetryPolicy ajusta limite de tentativas e intervalo entre elas.
func WithRetryPolicy(maxAttempts int, interval time.Duration) Option {
	return func(p *webhookProducer) {
		if maxAttempts > 0 {
			p.maxAttempts = maxAttempts
		}
		if interval >= 0 {
			p.retryInterval = interval
		}
	}
}

func NewWebhookProducer(
	loggerWrapper *logger_wrapper.LoggerManager,
	options ...Option,
) producer_interfaces.Producer {
	producer := &webhookProducer{
		loggerWrapper: loggerWrapper,
		maxAttempts:   defaultMaxAttempts,
		retryInterval: defaultRetryInterval,
		now:           time.Now,
	}
	for _, option := range options {
		option(producer)
	}
	return producer
}

func (p *webhookProducer) Produce(
	queueName string,
	payload []byte,
	webhookUrl string,
	userID string,
) error {
	splitQueue := strings.Split(queueName, ".")

	if len(splitQueue) < 2 {
		return nil
	}

	if webhookUrl == "" {
		return nil
	}

	// A tentativa e persistida ANTES da goroutine: se o processo cair entre o
	// evento e o HTTP, a entrega continua existindo e e retomada no boot.
	delivery, err := p.persist(queueName, payload, webhookUrl, userID)
	if err != nil {
		p.loggerWrapper.GetLogger(userID).LogError(
			"[%s] webhook could not be persisted before dispatch - destination: %s, error: %v",
			userID, redactWebhookURL(webhookUrl), err,
		)
		return err
	}

	p.inflight.Add(1)
	go func() {
		defer p.inflight.Done()
		p.deliver(delivery, webhookUrl)
	}()

	return nil
}

// ResumePending reenvia as tentativas que ficaram pendentes, tipicamente porque
// o processo caiu antes de concluir a entrega. Chamado no boot.
func (p *webhookProducer) ResumePending(limit int) (int, error) {
	if p.store == nil {
		return 0, nil
	}
	if limit <= 0 {
		limit = defaultResumeLimit
	}
	pending, err := p.store.ClaimPending(limit, p.now())
	if err != nil {
		return 0, err
	}

	resumed := 0
	for index := range pending {
		delivery := pending[index]
		target := ""
		if p.resolveURL != nil {
			target, err = p.resolveURL(delivery.InstanceID)
			if err != nil {
				p.loggerWrapper.GetLogger(delivery.InstanceID).LogWarn(
					"[%s] pending webhook could not resolve its destination - destination: %s, error: %v",
					delivery.InstanceID, delivery.Destination, err,
				)
				continue
			}
		}
		if strings.TrimSpace(target) == "" {
			p.loggerWrapper.GetLogger(delivery.InstanceID).LogWarn(
				"[%s] pending webhook has no destination anymore - destination: %s",
				delivery.InstanceID, delivery.Destination,
			)
			continue
		}

		resumed++
		p.inflight.Add(1)
		go func(item WebhookDelivery, url string) {
			defer p.inflight.Done()
			p.deliver(&item, url)
		}(delivery, target)
	}
	return resumed, nil
}

func (p *webhookProducer) persist(
	queueName string,
	payload []byte,
	webhookUrl string,
	userID string,
) (*WebhookDelivery, error) {
	delivery := &WebhookDelivery{
		InstanceID:    userID,
		Event:         eventFromPayload(payload, queueName),
		QueueName:     queueName,
		Destination:   redactWebhookURL(webhookUrl),
		Payload:       payload,
		Status:        DeliveryPending,
		NextAttemptAt: p.now(),
	}
	if p.store == nil {
		return delivery, nil
	}
	if err := p.store.Enqueue(delivery); err != nil {
		return nil, err
	}
	return delivery, nil
}

// deliver executa as tentativas de uma entrega, atualizando o estado a cada
// uma. 2xx conclui; 4xx e recusa definitiva do destino e nao e retentado; 5xx e
// erro de rede/timeout sao transitorios e voltam a ficar pendentes.
func (p *webhookProducer) deliver(delivery *WebhookDelivery, webhookUrl string) {
	userID := delivery.InstanceID
	destination := redactWebhookURL(webhookUrl)

	for delivery.Attempts < p.maxAttempts {
		delivery.Attempts++
		err, _, statusCode := p.sendWebhook(webhookUrl, delivery.Payload, userID)
		if err == nil {
			p.loggerWrapper.GetLogger(userID).LogInfo(
				"[%s] webhook sent successfully - destination: %s, status: %d, attempt: %d",
				userID, destination, statusCode, delivery.Attempts,
			)
			p.recordDone(delivery, statusCode)
			return
		}

		if isDefiniteRejection(statusCode) {
			p.loggerWrapper.GetLogger(userID).LogError(
				"[%s] webhook rejected by destination and will not be retried - destination: %s, status: %d",
				userID, destination, statusCode,
			)
			p.recordFailed(delivery, statusCode, err.Error())
			return
		}

		p.loggerWrapper.GetLogger(userID).LogWarn(
			"[%s] webhook failed - destination: %s, attempt: %d, status: %d, error: %v",
			userID, destination, delivery.Attempts, statusCode, err,
		)

		if delivery.Attempts >= p.maxAttempts {
			p.loggerWrapper.GetLogger(userID).LogError(
				"[%s] webhook failed after maximum retries - destination: %s",
				userID, destination,
			)
			p.recordFailed(delivery, statusCode, err.Error())
			return
		}

		p.recordRetry(delivery, statusCode, err.Error())
		time.Sleep(p.retryInterval)
	}
}

func (p *webhookProducer) recordDone(delivery *WebhookDelivery, statusCode int) {
	delivery.Status = DeliveryDone
	if p.store == nil {
		return
	}
	if err := p.store.MarkDone(delivery.ID, statusCode); err != nil {
		p.loggerWrapper.GetLogger(delivery.InstanceID).LogWarn(
			"[%s] webhook delivery could not be marked as done: %v", delivery.InstanceID, err,
		)
	}
}

func (p *webhookProducer) recordFailed(delivery *WebhookDelivery, statusCode int, reason string) {
	delivery.Status = DeliveryFailed
	if p.store == nil {
		return
	}
	if err := p.store.MarkFailed(delivery.ID, statusCode, reason); err != nil {
		p.loggerWrapper.GetLogger(delivery.InstanceID).LogWarn(
			"[%s] webhook delivery could not be marked as failed: %v", delivery.InstanceID, err,
		)
	}
}

func (p *webhookProducer) recordRetry(delivery *WebhookDelivery, statusCode int, reason string) {
	next := p.now().Add(p.retryInterval)
	delivery.NextAttemptAt = next
	if p.store == nil {
		return
	}
	if err := p.store.Reschedule(delivery.ID, delivery.Attempts, next, statusCode, reason); err != nil {
		p.loggerWrapper.GetLogger(delivery.InstanceID).LogWarn(
			"[%s] webhook delivery could not be rescheduled: %v", delivery.InstanceID, err,
		)
	}
}

func (p *webhookProducer) sendWebhook(url string, body []byte, userID string) (error, []byte, int) {
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		return err, nil, 0
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Request-Id", newRequestID())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err, nil, 0
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("erro ao ler resposta: %v", err), nil, 0
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.New("received non-2xx response: " + resp.Status), responseBody, resp.StatusCode
	}

	return nil, responseBody, resp.StatusCode
}

// isDefiniteRejection separa recusa do destino (4xx) de indisponibilidade
// (5xx, rede, timeout). Repetir um 4xx cinco vezes so gera ruido: o destino ja
// respondeu que nao aceita aquele evento.
func isDefiniteRejection(statusCode int) bool {
	return statusCode >= 400 && statusCode < 500
}

func eventFromPayload(payload []byte, queueName string) string {
	var envelope struct {
		Event string `json:"event"`
	}
	if err := json.Unmarshal(payload, &envelope); err == nil && envelope.Event != "" {
		return envelope.Event
	}
	parts := strings.Split(queueName, ".")
	return parts[len(parts)-1]
}

func newRequestID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err == nil {
		return hex.EncodeToString(value)
	}
	return "request-id-unavailable"
}

// CreateGlobalQueues não faz nada para webhook producer
func (p *webhookProducer) CreateGlobalQueues() error {
	return nil
}
