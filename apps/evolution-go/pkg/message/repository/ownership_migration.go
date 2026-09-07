package message_repository

import (
	"fmt"

	"gorm.io/gorm"
)

// Substituição da unicidade global de message_id, em ordem controlada.
//
// Fase 1 (EXPAND, padrão): a coluna instance_id passa a existir, o índice único
// composto (instance_id, message_id) é criado e a unicidade global antiga
// continua no lugar. Nesta fase o binário novo já grava com dono e já lê
// filtrado, mas duas instâncias ainda não conseguem repetir o mesmo
// message_id — nenhuma consulta vulnerável é recriada e nada é destruído.
//
// Fase 2 (CUTOVER, sob EVOLUTION_MESSAGE_OWNERSHIP_CUTOVER=true): a unicidade
// global é removida. Só deve ser executada depois de o ensaio confirmar que
// (a) o índice composto existe, e (b) não há gravação nova sem dono — o
// inventário de linhas órfãs remanescentes é do estoque legado, que é
// preservado e permanece inalcançável pelas consultas públicas.
//
// Não há backfill: o dono de uma linha legada não é dedutível de `source`, que
// guarda o telefone do chat. Inventar dono seria pior do que manter a linha
// isolada.
const (
	compositeIndexName = "idx_messages_instance_message"
	legacyUniqueColumn = "message_id"
)

// MessageOwnershipReport descreve o estado da migração sem expor nenhum dado.
type MessageOwnershipReport struct {
	CompositeIndexPresent bool
	LegacyUniquePresent   bool
	CutoverApplied        bool
	MessagesWithoutOwner  int64
	TotalMessages         int64
}

// InspectMessageOwnership devolve contagens sanitizadas para o ensaio.
func InspectMessageOwnership(db *gorm.DB) (MessageOwnershipReport, error) {
	report := MessageOwnershipReport{}

	if !db.Migrator().HasTable("messages") {
		return report, nil
	}

	report.CompositeIndexPresent = db.Migrator().HasIndex("messages", compositeIndexName)

	legacy, err := legacyUniqueConstraints(db)
	if err != nil {
		return report, err
	}
	report.LegacyUniquePresent = len(legacy) > 0
	report.CutoverApplied = !report.LegacyUniquePresent

	if db.Migrator().HasColumn("messages", "instance_id") {
		if err := db.Table("messages").
			Where("instance_id IS NULL OR instance_id = ''").
			Count(&report.MessagesWithoutOwner).Error; err != nil {
			return report, err
		}
	}

	if err := db.Table("messages").Count(&report.TotalMessages).Error; err != nil {
		return report, err
	}

	return report, nil
}

// ApplyMessageOwnershipCutover remove a unicidade global de message_id.
//
// Recusa enquanto o índice composto não existir: sem ele, retirar a restrição
// antiga deixaria a tabela sem nenhuma garantia de unicidade. É idempotente e
// pode ser repetida com segurança.
func ApplyMessageOwnershipCutover(db *gorm.DB) error {
	if !db.Migrator().HasIndex("messages", compositeIndexName) {
		return fmt.Errorf(
			"refusing cutover: composite index %s is missing; run the expand phase first",
			compositeIndexName,
		)
	}

	legacy, err := legacyUniqueConstraints(db)
	if err != nil {
		return err
	}

	for _, name := range legacy {
		if err := db.Exec(fmt.Sprintf("DROP INDEX IF EXISTS %q", name)).Error; err != nil {
			// Restrições criadas como CONSTRAINT não caem por DROP INDEX.
			if alterErr := db.Exec(fmt.Sprintf(
				"ALTER TABLE messages DROP CONSTRAINT IF EXISTS %q", name,
			)).Error; alterErr != nil {
				return fmt.Errorf("dropping legacy unique %s: %v / %v", name, err, alterErr)
			}
		}
	}

	return nil
}

// legacyUniqueConstraints lista índices únicos que cobrem somente message_id.
func legacyUniqueConstraints(db *gorm.DB) ([]string, error) {
	indexes, err := db.Migrator().GetIndexes("messages")
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, 1)
	for _, index := range indexes {
		unique, ok := index.Unique()
		if !ok || !unique {
			continue
		}
		columns := index.Columns()
		if len(columns) == 1 && columns[0] == legacyUniqueColumn {
			names = append(names, index.Name())
		}
	}
	return names, nil
}
