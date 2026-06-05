package webhook_producer

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
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

	loggerWrapper := logger_wrapper.NewLoggerManager(&config.Config{
		LogDirectory:  t.TempDir(),
		LogMaxSize:    1,
		LogMaxBackups: 1,
		LogMaxAge:     1,
	})
	producer := NewWebhookProducer(loggerWrapper)

	payload := []byte(`{"event":"MESSAGE"}`)
	if err := producer.Produce("messages.upsert", payload, server.URL, "test-instance"); err != nil {
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
