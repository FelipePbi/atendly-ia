package webhook_producer

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
	producer_interfaces "github.com/EvolutionAPI/evolution-go/pkg/events/interfaces"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
)

func TestProduceSendsOnlyToInstanceWebhookURL(t *testing.T) {
	requests := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", got)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("failed to read body: %v", err)
		}
		requests <- body
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	const instanceId = "test-instance"
	loggerWrapper := logger_wrapper.NewLoggerManager(&config.Config{
		LogDirectory:  t.TempDir(),
		LogMaxSize:    1,
		LogMaxBackups: 1,
		LogMaxAge:     1,
	})
	producer := NewWebhookProducer(loggerWrapper)

	// Registrado depois de t.TempDir(), portanto executa antes da remocao do
	// diretorio (cleanups rodam em LIFO). A entrega e assincrona e so escreve o
	// log de sucesso depois da resposta HTTP, entao a espera pelo fim da
	// goroutine precede o Close do logger.
	t.Cleanup(func() {
		waitForDeliveries(t, producer, 10*time.Second)
		if err := loggerWrapper.GetLogger(instanceId).Close(); err != nil {
			t.Errorf("logger Close() error = %v", err)
		}
	})

	payload := []byte(`{"event":"MESSAGE"}`)
	if err := producer.Produce("messages.upsert", payload, server.URL, instanceId); err != nil {
		t.Fatalf("Produce() error = %v", err)
	}

	select {
	case got := <-requests:
		if string(got) != string(payload) {
			t.Fatalf("payload = %s, want %s", got, payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for instance webhook request")
	}

	select {
	case extra := <-requests:
		t.Fatalf("unexpected extra webhook request: %s", extra)
	case <-time.After(100 * time.Millisecond):
	}
}

// waitForDeliveries espera as goroutines de entrega disparadas por Produce
// terminarem, com limite de tempo e sem sleep fixo.
func waitForDeliveries(t *testing.T, producer producer_interfaces.Producer, timeout time.Duration) {
	t.Helper()

	impl, ok := producer.(*webhookProducer)
	if !ok {
		t.Fatalf("producer type = %T, want *webhookProducer", producer)
	}

	done := make(chan struct{})
	go func() {
		impl.inflight.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(timeout):
		t.Fatalf("timed out waiting for webhook delivery goroutines")
	}
}
