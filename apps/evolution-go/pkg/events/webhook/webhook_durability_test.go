package webhook_producer

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
)

// fakeStore registra a ordem das operacoes para provar que a tentativa e
// persistida ANTES de a goroutine de HTTP existir.
type fakeStore struct {
	mu        sync.Mutex
	rows      map[string]*WebhookDelivery
	order     []string
	enqueueAt time.Time
}

func newFakeStore() *fakeStore {
	return &fakeStore{rows: map[string]*WebhookDelivery{}}
}

func (s *fakeStore) Enqueue(delivery *WebhookDelivery) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if delivery.ID == "" {
		delivery.ID = "delivery-1"
	}
	copied := *delivery
	s.rows[delivery.ID] = &copied
	s.order = append(s.order, "enqueue")
	s.enqueueAt = time.Now()
	return nil
}

func (s *fakeStore) MarkDone(id string, statusCode int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.order = append(s.order, "done")
	if row, ok := s.rows[id]; ok {
		row.Status = DeliveryDone
		row.LastStatusCode = statusCode
	}
	return nil
}

func (s *fakeStore) MarkFailed(id string, statusCode int, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.order = append(s.order, "failed")
	if row, ok := s.rows[id]; ok {
		row.Status = DeliveryFailed
		row.LastStatusCode = statusCode
		row.LastError = reason
	}
	return nil
}

func (s *fakeStore) Reschedule(id string, attempts int, nextAttemptAt time.Time, statusCode int, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.order = append(s.order, "reschedule")
	if row, ok := s.rows[id]; ok {
		row.Status = DeliveryPending
		row.Attempts = attempts
		row.NextAttemptAt = nextAttemptAt
		row.LastStatusCode = statusCode
		row.LastError = reason
	}
	return nil
}

func (s *fakeStore) ClaimPending(limit int, now time.Time) ([]WebhookDelivery, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var pending []WebhookDelivery
	for _, row := range s.rows {
		if row.Status == DeliveryPending && !row.NextAttemptAt.After(now) {
			pending = append(pending, *row)
		}
		if len(pending) >= limit {
			break
		}
	}
	return pending, nil
}

func (s *fakeStore) snapshot(id string) WebhookDelivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	return *s.rows[id]
}

func (s *fakeStore) steps() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.order...)
}

func testLogger(t *testing.T) *logger_wrapper.LoggerManager {
	t.Helper()
	return logger_wrapper.NewLoggerManager(&config.Config{
		LogDirectory:  t.TempDir(),
		LogMaxSize:    1,
		LogMaxBackups: 1,
		LogMaxAge:     1,
	})
}

func waitFor(t *testing.T, producer producer_like, timeout time.Duration) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		producer.wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
		t.Fatalf("timed out waiting for webhook delivery goroutines")
	}
}

type producer_like interface{ wait() }

func (p *webhookProducer) wait() { p.inflight.Wait() }

func TestProducePersistsBeforeDispatchingAndCompletesOn2xx(t *testing.T) {
	requestSeen := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestSeen <- struct{}{}
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	store := newFakeStore()
	loggerWrapper := testLogger(t)
	producer := NewWebhookProducer(loggerWrapper, WithDeliveryStore(store)).(*webhookProducer)
	t.Cleanup(func() {
		waitFor(t, producer, 10*time.Second)
		if err := loggerWrapper.GetLogger("instance-1").Close(); err != nil {
			t.Errorf("logger Close() error = %v", err)
		}
	})

	payload := []byte(`{"event":"Message"}`)
	if err := producer.Produce("instance-1.message", payload, server.URL+"/hook?token=super-secret", "instance-1"); err != nil {
		t.Fatalf("Produce() error = %v", err)
	}

	// A linha ja existe assim que Produce retorna: nao ha janela em que o
	// evento esteja apenas numa goroutine.
	if got := store.steps(); len(got) == 0 || got[0] != "enqueue" {
		t.Fatalf("first store operation = %v, want enqueue before dispatch", got)
	}

	select {
	case <-requestSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the webhook request")
	}
	waitFor(t, producer, 5*time.Second)

	row := store.snapshot("delivery-1")
	if row.Status != DeliveryDone {
		t.Fatalf("status = %q, want %q", row.Status, DeliveryDone)
	}
	if row.Event != "Message" {
		t.Fatalf("event = %q, want Message", row.Event)
	}
	if strings.Contains(row.Destination, "token") {
		t.Fatalf("destination %q still carries the webhook token", row.Destination)
	}
}

func TestDefiniteRejectionIsNotRetried(t *testing.T) {
	var attempts int
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		attempts++
		mu.Unlock()
		w.WriteHeader(http.StatusBadRequest)
	}))
	t.Cleanup(server.Close)

	store := newFakeStore()
	loggerWrapper := testLogger(t)
	producer := NewWebhookProducer(
		loggerWrapper,
		WithDeliveryStore(store),
		WithRetryPolicy(3, time.Millisecond),
	).(*webhookProducer)
	t.Cleanup(func() {
		waitFor(t, producer, 10*time.Second)
		if err := loggerWrapper.GetLogger("instance-1").Close(); err != nil {
			t.Errorf("logger Close() error = %v", err)
		}
	})

	if err := producer.Produce("instance-1.message", []byte(`{"event":"Message"}`), server.URL, "instance-1"); err != nil {
		t.Fatalf("Produce() error = %v", err)
	}
	waitFor(t, producer, 5*time.Second)

	mu.Lock()
	got := attempts
	mu.Unlock()
	if got != 1 {
		t.Fatalf("attempts = %d, want 1: a 4xx is a definite rejection", got)
	}
	if row := store.snapshot("delivery-1"); row.Status != DeliveryFailed || row.LastStatusCode != http.StatusBadRequest {
		t.Fatalf("row = %+v, want failed with status 400", row)
	}
}

func TestTransientFailureStaysPendingAndIsResumed(t *testing.T) {
	var mu sync.Mutex
	fail := true
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		attempts++
		shouldFail := fail
		mu.Unlock()
		if shouldFail {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	store := newFakeStore()
	loggerWrapper := testLogger(t)
	// Uma unica tentativa por processo: a segunda so acontece na retomada,
	// exatamente como depois de um restart.
	producer := NewWebhookProducer(
		loggerWrapper,
		WithDeliveryStore(store),
		WithRetryPolicy(1, time.Millisecond),
		WithURLResolver(func(instanceID string) (string, error) { return server.URL, nil }),
	).(*webhookProducer)
	t.Cleanup(func() {
		waitFor(t, producer, 10*time.Second)
		if err := loggerWrapper.GetLogger("instance-1").Close(); err != nil {
			t.Errorf("logger Close() error = %v", err)
		}
	})

	if err := producer.Produce("instance-1.message", []byte(`{"event":"Message"}`), server.URL, "instance-1"); err != nil {
		t.Fatalf("Produce() error = %v", err)
	}
	waitFor(t, producer, 5*time.Second)

	if row := store.snapshot("delivery-1"); row.Status != DeliveryFailed {
		t.Fatalf("status = %q, want %q after exhausting attempts", row.Status, DeliveryFailed)
	}

	// Volta a pendente como ficaria se o processo tivesse caido no meio.
	if err := store.Reschedule("delivery-1", 0, time.Now().Add(-time.Minute), 0, "process restarted"); err != nil {
		t.Fatalf("Reschedule() error = %v", err)
	}
	mu.Lock()
	fail = false
	mu.Unlock()

	resumed, err := producer.ResumePending(10)
	if err != nil {
		t.Fatalf("ResumePending() error = %v", err)
	}
	if resumed != 1 {
		t.Fatalf("resumed = %d, want 1", resumed)
	}
	waitFor(t, producer, 5*time.Second)

	if row := store.snapshot("delivery-1"); row.Status != DeliveryDone {
		t.Fatalf("status = %q, want %q after resume", row.Status, DeliveryDone)
	}
	mu.Lock()
	got := attempts
	mu.Unlock()
	if got != 2 {
		t.Fatalf("attempts = %d, want 2 (one before the restart, one after)", got)
	}
}

func TestRedactWebhookURLDropsQueryAndCredentials(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"https://ai.example.com/webhooks/evolution?token=super-secret", "https://ai.example.com/webhooks/evolution"},
		{"http://user:pass@localhost:3002/hook?apikey=abc", "http://localhost:3002/hook"},
		{"", ""},
	}
	for _, testCase := range cases {
		if got := redactWebhookURL(testCase.raw); got != testCase.want {
			t.Fatalf("redactWebhookURL(%q) = %q, want %q", testCase.raw, got, testCase.want)
		}
	}
}
