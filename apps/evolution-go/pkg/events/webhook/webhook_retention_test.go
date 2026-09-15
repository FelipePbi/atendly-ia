package webhook_producer

import (
	"sort"
	"sync"
	"testing"
	"time"
)

// retentionFakeStore guarda linhas em memoria com status e updated_at
// controlaveis, para exercitar a varredura de retencao sem banco.
type retentionFakeStore struct {
	mu   sync.Mutex
	rows map[string]*WebhookDelivery
}

func newRetentionFakeStore() *retentionFakeStore {
	return &retentionFakeStore{rows: map[string]*WebhookDelivery{}}
}

func (s *retentionFakeStore) put(id, status string, updatedAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rows[id] = &WebhookDelivery{ID: id, Status: status, UpdatedAt: updatedAt}
}

func (s *retentionFakeStore) has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.rows[id]
	return ok
}

func (s *retentionFakeStore) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.rows)
}

func (s *retentionFakeStore) Enqueue(delivery *WebhookDelivery) error { return nil }
func (s *retentionFakeStore) MarkDone(id string, statusCode int) error { return nil }
func (s *retentionFakeStore) MarkFailed(id string, statusCode int, reason string) error {
	return nil
}
func (s *retentionFakeStore) Reschedule(id string, attempts int, nextAttemptAt time.Time, statusCode int, reason string) error {
	return nil
}
func (s *retentionFakeStore) ClaimPending(limit int, now time.Time) ([]WebhookDelivery, error) {
	return nil, nil
}

// PruneTerminal reproduz a semantica do store real: so done/failed mais
// velhas que `before` sao elegiveis, respeitando o teto de lote e removendo
// as mais antigas primeiro.
func (s *retentionFakeStore) PruneTerminal(before time.Time, limit int) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var eligible []*WebhookDelivery
	for _, row := range s.rows {
		if (row.Status == DeliveryDone || row.Status == DeliveryFailed) && row.UpdatedAt.Before(before) {
			eligible = append(eligible, row)
		}
	}
	sort.Slice(eligible, func(i, j int) bool { return eligible[i].UpdatedAt.Before(eligible[j].UpdatedAt) })
	if len(eligible) > limit {
		eligible = eligible[:limit]
	}
	for _, row := range eligible {
		delete(s.rows, row.ID)
	}
	return int64(len(eligible)), nil
}

func TestPruneTerminalRemovesOldTerminalDeliveries(t *testing.T) {
	store := newRetentionFakeStore()
	now := time.Now()
	store.put("old-done", DeliveryDone, now.Add(-48*time.Hour))
	store.put("old-failed", DeliveryFailed, now.Add(-72*time.Hour))

	loggerWrapper := testLogger(t)
	producer := NewWebhookProducer(
		loggerWrapper,
		WithDeliveryStore(store),
		WithRetentionPolicy(24*time.Hour, time.Hour, 10),
	).(*webhookProducer)
	t.Cleanup(producer.Close)

	waitForPrune(t, store, 0, 2*time.Second)

	if store.has("old-done") || store.has("old-failed") {
		t.Fatalf("store after sweep = %+v, want both old terminal deliveries removed", store.rows)
	}
}

func TestPruneTerminalPreservesPendingAndRecent(t *testing.T) {
	store := newRetentionFakeStore()
	now := time.Now()
	store.put("old-done", DeliveryDone, now.Add(-48*time.Hour))
	store.put("old-pending", DeliveryPending, now.Add(-48*time.Hour))
	store.put("recent-failed", DeliveryFailed, now.Add(-time.Minute))

	loggerWrapper := testLogger(t)
	producer := NewWebhookProducer(
		loggerWrapper,
		WithDeliveryStore(store),
		WithRetentionPolicy(24*time.Hour, time.Hour, 10),
	).(*webhookProducer)
	t.Cleanup(producer.Close)

	waitForPrune(t, store, 2, 2*time.Second)

	if store.has("old-done") {
		t.Fatalf("old-done still present, want removed")
	}
	if !store.has("old-pending") {
		t.Fatalf("old-pending removed, want preserved regardless of age: pending is never terminal")
	}
	if !store.has("recent-failed") {
		t.Fatalf("recent-failed removed, want preserved: not old enough yet")
	}
}

func TestPruneTerminalRespectsBatchLimit(t *testing.T) {
	store := newRetentionFakeStore()
	now := time.Now()
	for i := 0; i < 5; i++ {
		store.put(idFor(i), DeliveryDone, now.Add(-48*time.Hour))
	}

	loggerWrapper := testLogger(t)
	producer := NewWebhookProducer(
		loggerWrapper,
		WithDeliveryStore(store),
		WithRetentionPolicy(24*time.Hour, time.Hour, 2),
	).(*webhookProducer)
	t.Cleanup(producer.Close)

	// A primeira varredura roda no boot e remove no maximo o teto do lote: das
	// 5 elegiveis, so 2 saem numa unica chamada.
	waitForPrune(t, store, 3, 2*time.Second)
}

func waitForPrune(t *testing.T, store *retentionFakeStore, wantRemaining int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if store.count() == wantRemaining {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("store did not settle at %d rows within %s, got %d", wantRemaining, timeout, store.count())
}

func idFor(i int) string {
	return "delivery-" + string(rune('a'+i))
}
