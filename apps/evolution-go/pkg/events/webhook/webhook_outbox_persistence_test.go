package webhook_producer

import (
	"os"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Ensaio do outbox tecnico contra persistencia real.
//
// Roda apenas com EVOLUTION_TEST_DATABASE_URL apontando para um PostgreSQL
// descartavel — o mesmo backend usado em producao, provisionado so para o gate.
// Sem a variavel a suite e pulada, para que o gate local nao dependa de banco
// pessoal; validate:integration a fornece.
func outboxTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	url := os.Getenv("EVOLUTION_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("EVOLUTION_TEST_DATABASE_URL is not set: skipping the webhook outbox rehearsal against a disposable PostgreSQL")
	}

	db, err := gorm.Open(postgres.Open(url), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("gorm.Open() error = %v", err)
	}
	return db
}

func TestGormDeliveryStoreSurvivesRestart(t *testing.T) {
	db := outboxTestDB(t)
	if err := db.Exec(`DROP TABLE IF EXISTS webhook_deliveries`).Error; err != nil {
		t.Fatalf("dropping table: %v", err)
	}

	// AutoMigrate aditivo: cria a tabela nova sem tocar nas existentes.
	store, err := NewGormDeliveryStore(db)
	if err != nil {
		t.Fatalf("NewGormDeliveryStore() error = %v", err)
	}

	delivery := &WebhookDelivery{
		InstanceID:    "11111111-1111-4111-8111-111111111111",
		Event:         "Message",
		QueueName:     "instance.message",
		Destination:   "https://ai.example.com/webhooks/evolution",
		Payload:       []byte(`{"event":"Message"}`),
		Status:        DeliveryPending,
		NextAttemptAt: time.Now().Add(-time.Minute),
	}
	if err := store.Enqueue(delivery); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}
	if delivery.ID == "" {
		t.Fatal("Enqueue() did not assign an id to the delivery")
	}

	// Um processo novo enxerga a tentativa pendente: e isso que faz o restart
	// reenviar em vez de esquecer.
	reopened, err := NewGormDeliveryStore(db)
	if err != nil {
		t.Fatalf("NewGormDeliveryStore() error = %v", err)
	}
	pending, err := reopened.ClaimPending(10, time.Now())
	if err != nil {
		t.Fatalf("ClaimPending() error = %v", err)
	}
	if len(pending) != 1 || pending[0].ID != delivery.ID {
		t.Fatalf("pending = %+v, want the enqueued delivery", pending)
	}
	if string(pending[0].Payload) != `{"event":"Message"}` {
		t.Fatalf("payload = %s, want the original event", pending[0].Payload)
	}

	if err := reopened.MarkDone(delivery.ID, 204); err != nil {
		t.Fatalf("MarkDone() error = %v", err)
	}
	after, err := reopened.ClaimPending(10, time.Now())
	if err != nil {
		t.Fatalf("ClaimPending() error = %v", err)
	}
	if len(after) != 0 {
		t.Fatalf("pending after 2xx = %+v, want none", after)
	}

	var stored WebhookDelivery
	if err := db.First(&stored, "id = ?", delivery.ID).Error; err != nil {
		t.Fatalf("reading stored delivery: %v", err)
	}
	if stored.Status != DeliveryDone || stored.LastStatusCode != 204 {
		t.Fatalf("stored = %+v, want done with status 204", stored)
	}
}
