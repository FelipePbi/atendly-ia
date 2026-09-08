package webhook_producer

import (
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Estados da tentativa de entrega. `pending` e o unico estado retentavel;
// `done` e `failed` sao terminais.
const (
	DeliveryPending = "pending"
	DeliveryDone    = "done"
	DeliveryFailed  = "failed"
)

// WebhookDelivery e a tentativa de entrega persistida antes da goroutine de
// HTTP.
//
// O destino guardado e redigido de proposito: a URL de webhook da instancia
// carrega o token em query string e este outbox nao e lugar de segredo. Na
// retomada o destino real e resolvido de novo a partir da propria instancia,
// que continua sendo a unica dona dessa credencial.
type WebhookDelivery struct {
	ID             string    `gorm:"type:uuid;primaryKey" json:"id"`
	InstanceID     string    `gorm:"column:instance_id;index:idx_webhook_deliveries_pending,priority:2" json:"instance_id"`
	Event          string    `json:"event"`
	QueueName      string    `gorm:"column:queue_name" json:"queue_name"`
	Destination    string    `json:"destination"`
	Payload        []byte    `gorm:"type:bytea" json:"-"`
	Status         string    `gorm:"index:idx_webhook_deliveries_pending,priority:1" json:"status"`
	Attempts       int       `json:"attempts"`
	NextAttemptAt  time.Time `gorm:"column:next_attempt_at;index:idx_webhook_deliveries_pending,priority:3" json:"next_attempt_at"`
	LastStatusCode int       `gorm:"column:last_status_code" json:"last_status_code"`
	LastError      string    `gorm:"column:last_error" json:"last_error"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (WebhookDelivery) TableName() string {
	return "webhook_deliveries"
}

func (d *WebhookDelivery) BeforeCreate(tx *gorm.DB) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return nil
}

// DeliveryStore e a persistencia da tentativa. A interface existe para que o
// produtor nao dependa de gorm e para que a ordem "persistir antes de disparar"
// seja testavel sem banco.
type DeliveryStore interface {
	Enqueue(delivery *WebhookDelivery) error
	MarkDone(id string, statusCode int) error
	MarkFailed(id string, statusCode int, reason string) error
	Reschedule(id string, attempts int, nextAttemptAt time.Time, statusCode int, reason string) error
	ClaimPending(limit int, now time.Time) ([]WebhookDelivery, error)
}

type gormDeliveryStore struct {
	db *gorm.DB
}

// NewGormDeliveryStore cria o outbox no banco ja configurado do Evolution, via
// AutoMigrate aditivo: nenhuma tabela existente e alterada e um binario
// anterior simplesmente ignora a tabela nova.
func NewGormDeliveryStore(db *gorm.DB) (DeliveryStore, error) {
	if db == nil {
		return nil, errors.New("webhook outbox: database is not configured")
	}
	if err := db.AutoMigrate(&WebhookDelivery{}); err != nil {
		return nil, err
	}
	return &gormDeliveryStore{db: db}, nil
}

func (s *gormDeliveryStore) Enqueue(delivery *WebhookDelivery) error {
	return s.db.Create(delivery).Error
}

func (s *gormDeliveryStore) MarkDone(id string, statusCode int) error {
	return s.db.Model(&WebhookDelivery{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":           DeliveryDone,
		"last_status_code": statusCode,
		"last_error":       "",
		"updated_at":       time.Now(),
	}).Error
}

func (s *gormDeliveryStore) MarkFailed(id string, statusCode int, reason string) error {
	return s.db.Model(&WebhookDelivery{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":           DeliveryFailed,
		"last_status_code": statusCode,
		"last_error":       truncateReason(reason),
		"updated_at":       time.Now(),
	}).Error
}

func (s *gormDeliveryStore) Reschedule(id string, attempts int, nextAttemptAt time.Time, statusCode int, reason string) error {
	return s.db.Model(&WebhookDelivery{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":           DeliveryPending,
		"attempts":         attempts,
		"next_attempt_at":  nextAttemptAt,
		"last_status_code": statusCode,
		"last_error":       truncateReason(reason),
		"updated_at":       time.Now(),
	}).Error
}

func (s *gormDeliveryStore) ClaimPending(limit int, now time.Time) ([]WebhookDelivery, error) {
	var pending []WebhookDelivery
	err := s.db.
		Where("status = ? AND next_attempt_at <= ?", DeliveryPending, now).
		Order("next_attempt_at asc").
		Limit(limit).
		Find(&pending).Error
	return pending, err
}

// redactWebhookURL devolve apenas esquema, host e caminho.
//
// O log do produtor imprimia a URL inteira, com o token do webhook na query.
// Host e caminho bastam para diagnosticar destino errado; o segredo nao.
func redactWebhookURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return "[unparseable-url]"
	}
	redacted := url.URL{Scheme: parsed.Scheme, Host: parsed.Host, Path: parsed.Path}
	return redacted.String()
}

func truncateReason(reason string) string {
	const limit = 300
	if len(reason) <= limit {
		return reason
	}
	return reason[:limit]
}
