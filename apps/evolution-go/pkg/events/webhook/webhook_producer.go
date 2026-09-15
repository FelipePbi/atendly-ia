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
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	producer_interfaces "github.com/EvolutionAPI/evolution-go/pkg/events/interfaces"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
	global_logger "github.com/gomessguii/logger"
)

const (
	defaultMaxAttempts   = 5
	defaultRetryInterval = 30 * time.Second
	defaultResumeLimit   = 100

	// Retencao tecnica do outbox: entrega terminal (done ou failed) e log
	// operacional do transporte, nao dado de produto, entao o prazo default e
	// folgado de proposito. Teto de lote evita que uma varredura tardia vire
	// uma transacao gigante.
	defaultRetentionMaxAge = 30 * 24 * time.Hour
	defaultRetentionSweep  = 6 * time.Hour
	defaultRetentionBatch  = 500

	envRetentionMaxAgeHours  = "WEBHOOK_OUTBOX_RETENTION_HOURS"
	envRetentionSweepMinutes = "WEBHOOK_OUTBOX_RETENTION_SWEEP_MINUTES"
	envRetentionBatchSize    = "WEBHOOK_OUTBOX_RETENTION_BATCH_SIZE"
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

	retentionMaxAge time.Duration
	retentionSweep  time.Duration
	retentionBatch  int
	// retentionStop/retentionDone existem so para os testes encerrarem a
	// varredura periodica sem vazar goroutine entre casos; o processo de
	// producao roda a varredura ate o transporte cair.
	retentionStop chan struct{}
	retentionDone chan struct{}
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

// WithRetentionPolicy ajusta prazo, intervalo de varredura e teto de lote da
// retencao tecnica do outbox. Usado pelos testes para nao depender das
// duracoes default, que sao propositalmente longas em producao.
func WithRetentionPolicy(maxAge, sweep time.Duration, batchSize int) Option {
	return func(p *webhookProducer) {
		if maxAge > 0 {
			p.retentionMaxAge = maxAge
		}
		if sweep > 0 {
			p.retentionSweep = sweep
		}
		if batchSize > 0 {
			p.retentionBatch = batchSize
		}
	}
}

func NewWebhookProducer(
	loggerWrapper *logger_wrapper.LoggerManager,
	options ...Option,
) producer_interfaces.Producer {
	producer := &webhookProducer{
		loggerWrapper:   loggerWrapper,
		maxAttempts:     defaultMaxAttempts,
		retryInterval:   defaultRetryInterval,
		now:             time.Now,
		retentionMaxAge: retentionMaxAgeFromEnv(),
		retentionSweep:  retentionSweepFromEnv(),
		retentionBatch:  retentionBatchFromEnv(),
	}
	for _, option := range options {
		option(producer)
	}
	// A varredura so faz sentido com outbox durável: sem store nao ha o que
	// apagar, e e o mesmo guard que ResumePending ja usa.
	if producer.store != nil {
		producer.startRetentionSweep()
	}
	return producer
}

func retentionMaxAgeFromEnv() time.Duration {
	if hours, ok := positiveIntEnv(envRetentionMaxAgeHours); ok {
		return time.Duration(hours) * time.Hour
	}
	return defaultRetentionMaxAge
}

func retentionSweepFromEnv() time.Duration {
	if minutes, ok := positiveIntEnv(envRetentionSweepMinutes); ok {
		return time.Duration(minutes) * time.Minute
	}
	return defaultRetentionSweep
}

func retentionBatchFromEnv() int {
	if batch, ok := positiveIntEnv(envRetentionBatchSize); ok {
		return batch
	}
	return defaultRetentionBatch
}

func positiveIntEnv(name string) (int, bool) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return 0, false
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return 0, false
	}
	return value, true
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

// startRetentionSweep roda a primeira varredura no boot -- junto do resto do
// que ja acontece na construcao do produtor, como ResumePending -- e depois
// periodicamente, no proprio processo do transporte. O prune e do transporte
// porque o payload do webhook e dado do transporte: nenhum outro servico
// manda o Go apagar sua propria tabela.
func (p *webhookProducer) startRetentionSweep() {
	p.retentionStop = make(chan struct{})
	p.retentionDone = make(chan struct{})
	go func() {
		defer close(p.retentionDone)
		p.pruneTerminal()
		ticker := time.NewTicker(p.retentionSweep)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				p.pruneTerminal()
			case <-p.retentionStop:
				return
			}
		}
	}()
}

// pruneTerminal remove, em uma chamada limitada ao teto de lote, as entregas
// terminais (done ou failed) mais velhas que o prazo configurado. Pendente e
// reagendada nunca sao terminais e por isso nunca sao candidatas, independente
// da idade.
func (p *webhookProducer) pruneTerminal() {
	if p.store == nil {
		return
	}
	removed, err := p.store.PruneTerminal(p.now().Add(-p.retentionMaxAge), p.retentionBatch)
	if err != nil {
		global_logger.LogWarn("webhook outbox retention sweep failed: %v", err)
		return
	}
	if removed > 0 {
		global_logger.LogInfo("webhook outbox retention sweep removed %d terminal deliveries older than %s", removed, p.retentionMaxAge)
	}
}

// Close encerra a varredura periodica de retencao. Existe para os testes nao
// vazarem goroutine entre casos; o transporte em producao roda ate cair.
func (p *webhookProducer) Close() {
	if p.retentionStop == nil {
		return
	}
	close(p.retentionStop)
	<-p.retentionDone
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
