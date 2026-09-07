package webhook_producer

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
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

type webhookProducer struct {
	loggerWrapper *logger_wrapper.LoggerManager
	// inflight contabiliza as entregas assincronas ja disparadas por Produce.
	// Nao altera politica de retry nem de entrega: existe apenas para que o
	// teste possa esperar de forma deterministica o fim da goroutine antes de
	// fechar o logger da instancia. Sem isso o log de sucesso e escrito depois
	// da resposta HTTP e mantem instance.log aberto no cleanup.
	inflight sync.WaitGroup
}

func NewWebhookProducer(
	loggerWrapper *logger_wrapper.LoggerManager,
) producer_interfaces.Producer {
	return &webhookProducer{
		loggerWrapper: loggerWrapper,
	}
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

	if webhookUrl != "" {
		p.inflight.Add(1)
		go func() {
			defer p.inflight.Done()
			p.sendWebhookWithRetry(webhookUrl, payload, 5, 30*time.Second, userID)
		}()
	}

	return nil
}

func (p *webhookProducer) sendWebhookWithRetry(url string, body []byte, maxRetries int, retryInterval time.Duration, userID string) {
	for i := 0; i < maxRetries; i++ {
		err, _, statusCode := p.sendWebhook(url, body, userID)
		if err == nil {
			p.loggerWrapper.GetLogger(userID).LogInfo("[%s] webhook sent successfully - url: %s, status: %d", userID, url, statusCode)
			return
		}
		p.loggerWrapper.GetLogger(userID).LogWarn("[%s] webhook failed - url: %s, attempt: %d, error: %v", userID, url, i+1, err)

		time.Sleep(retryInterval)
	}
	p.loggerWrapper.GetLogger(userID).LogError("[%s] webhook failed after maximum retries - url: %s", userID, url)
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
