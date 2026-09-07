package message_repository

import (
	"errors"

	message_model "github.com/EvolutionAPI/evolution-go/pkg/message/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrMissingInstanceOwner recusa gravação sem dono. Depois da expansão do
// schema, dono ausente é permitido apenas no estoque legado já persistido:
// nenhuma escrita nova pode criar uma linha órfã.
var ErrMissingInstanceOwner = errors.New("message requires an owning instance")

type MessageRepository interface {
	InsertMessage(message message_model.Message) error
	// GetMessageByID lê metadados dentro do escopo da instância dona.
	// ID desconhecido e ID de outra instância retornam o mesmo resultado vazio:
	// a resposta não distingue "não existe" de "existe e é de outro".
	GetMessageByID(instanceID string, messageID string) (*message_model.Message, error)
	// DeleteAllMessages é operação administrativa global e só deve ser exposta
	// sob autorização administrativa comprovada, nunca sob token de instância.
	DeleteAllMessages() (int64, error)
	DeleteMessagesByInstance(instanceID string) (int64, error)
	GetLatestMessageID(instanceID string, source string) (string, string, error)
}

type messageRepository struct {
	db *gorm.DB
}

func (m *messageRepository) InsertMessage(message message_model.Message) error {
	if message.InstanceID == "" {
		return ErrMissingInstanceOwner
	}

	// Conflito resolvido pelo par (instance_id, message_id): o mesmo
	// message_id em duas instâncias produz duas linhas independentes, e um
	// upsert nunca sobrescreve o registro alheio.
	return m.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "instance_id"}, {Name: "message_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"timestamp", "status", "source"}),
	}).Create(&message).Error
}

func (m *messageRepository) GetMessageByID(instanceID string, messageID string) (*message_model.Message, error) {
	if instanceID == "" {
		return nil, ErrMissingInstanceOwner
	}

	var message message_model.Message
	err := m.db.Where("instance_id = ? AND message_id = ?", instanceID, messageID).First(&message).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &message, nil
}

func (m *messageRepository) DeleteAllMessages() (int64, error) {
	result := m.db.Exec("DELETE FROM messages")
	return result.RowsAffected, result.Error
}

func (m *messageRepository) DeleteMessagesByInstance(instanceID string) (int64, error) {
	if instanceID == "" {
		return 0, ErrMissingInstanceOwner
	}

	result := m.db.Where("instance_id = ?", instanceID).Delete(&message_model.Message{})
	return result.RowsAffected, result.Error
}

func (m *messageRepository) GetLatestMessageID(instanceID string, source string) (string, string, error) {
	if instanceID == "" {
		return "", "", ErrMissingInstanceOwner
	}

	var message message_model.Message
	err := m.db.Where("instance_id = ? AND source = ?", instanceID, source).Order("timestamp DESC").First(&message).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", "", nil
		}
		return "", "", err
	}

	return message.MessageID, message.Timestamp, nil
}

func NewMessageRepository(db *gorm.DB) MessageRepository {
	return &messageRepository{db: db}
}
