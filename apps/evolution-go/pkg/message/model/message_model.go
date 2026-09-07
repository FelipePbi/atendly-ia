package message_model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Message guarda metadados de entrega/leitura por instância.
//
// InstanceID é o dono do registro. O Evolution conhece instância, não o tenant
// de produto: o dono vem sempre do contexto autenticado ou da instância que
// produziu o evento, nunca de `Source` (que é o telefone do chat), de ID
// enviado pelo cliente ou da conexão de quem pergunta.
//
// A identidade de negócio é (instance_id, message_id). InstanceID é nullable no
// schema apenas para o estoque legado gravado antes da migração; essas linhas
// não são alcançáveis por nenhuma consulta pública. Gravação nova sem dono é
// recusada no repositório.
type Message struct {
	Id         string `json:"id" gorm:"type:uuid;primaryKey"`
	InstanceID string `json:"instance_id" gorm:"column:instance_id;index:idx_messages_instance_message,unique,priority:1"`
	MessageID  string `json:"message_id" gorm:"index:idx_messages_instance_message,unique,priority:2"`
	Timestamp  string `json:"timestamp"`
	Status     string `json:"status"`
	Source     string `json:"source"`
}

func (m *Message) BeforeCreate(tx *gorm.DB) (err error) {
	m.Id = uuid.New().String()
	return
}
