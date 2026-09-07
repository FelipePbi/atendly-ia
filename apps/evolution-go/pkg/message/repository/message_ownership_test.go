package message_repository

import (
	"errors"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	message_model "github.com/EvolutionAPI/evolution-go/pkg/message/model"
)

// Ensaio de propriedade de metadados (G-35) contra persistência real.
//
// Roda apenas com EVOLUTION_TEST_DATABASE_URL apontando para um PostgreSQL
// descartável — o mesmo backend usado em produção, provisionado só para o gate.
// Sem a variável a suíte é pulada, para que o gate local não dependa de banco
// pessoal; validate:integration a fornece.
const (
	instanceA = "11111111-1111-4111-8111-111111111111"
	instanceB = "22222222-2222-4222-8222-222222222222"
	sharedID  = "3EB0SHAREDSHAREDSHARED"
	contactA  = "5511999999999"
	contactB  = "5511888888888"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()

	url := os.Getenv("EVOLUTION_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("EVOLUTION_TEST_DATABASE_URL is not set: skipping the ownership rehearsal against a disposable PostgreSQL")
	}

	db, err := gorm.Open(postgres.Open(url), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("gorm.Open() error = %v", err)
	}
	return db
}

// legacyTable recria a tabela como ela existia antes deste Goal: sem dono e com
// unicidade global de message_id.
func legacyTable(t *testing.T, db *gorm.DB) {
	t.Helper()

	statements := []string{
		`DROP TABLE IF EXISTS messages`,
		`CREATE TABLE messages (
			id uuid PRIMARY KEY,
			message_id text,
			timestamp text,
			status text,
			source text
		)`,
		`CREATE UNIQUE INDEX idx_messages_message_id ON messages (message_id)`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("preparing legacy table: %v", err)
		}
	}
}

func expand(t *testing.T, db *gorm.DB) {
	t.Helper()

	if err := db.AutoMigrate(&message_model.Message{}); err != nil {
		t.Fatalf("AutoMigrate() error = %v", err)
	}
}

func insertLegacyRow(t *testing.T, db *gorm.DB, id string, messageID string, source string) {
	t.Helper()

	err := db.Exec(
		`INSERT INTO messages (id, message_id, timestamp, status, source) VALUES (?, ?, ?, ?, ?)`,
		id, messageID, "2026-09-07 10:00:00", "Delivered", source,
	).Error
	if err != nil {
		t.Fatalf("inserting legacy row: %v", err)
	}
}

func TestMessageOwnershipMigrationRehearsal(t *testing.T) {
	db := testDB(t)

	t.Run("expand keeps history and adds the composite index without dropping the old unique", func(t *testing.T) {
		legacyTable(t, db)
		insertLegacyRow(t, db, "00000000-0000-4000-8000-000000000001", "3EB0LEGACY0000000001", contactA)
		insertLegacyRow(t, db, "00000000-0000-4000-8000-000000000002", "3EB0LEGACY0000000002", contactB)

		expand(t, db)

		report, err := InspectMessageOwnership(db)
		if err != nil {
			t.Fatalf("InspectMessageOwnership() error = %v", err)
		}
		if !report.CompositeIndexPresent {
			t.Fatal("composite index (instance_id, message_id) is missing after expand")
		}
		if !report.LegacyUniquePresent {
			t.Fatal("expand must not remove the legacy global unique: the cutover is a separate, explicit step")
		}
		if report.TotalMessages != 2 {
			t.Fatalf("TotalMessages = %d, want 2: history must be preserved", report.TotalMessages)
		}
		if report.MessagesWithoutOwner != 2 {
			t.Fatalf("MessagesWithoutOwner = %d, want 2: legacy rows keep no invented owner", report.MessagesWithoutOwner)
		}
	})

	t.Run("legacy rows without owner stay unreachable from every scoped read", func(t *testing.T) {
		repository := NewMessageRepository(db)

		found, err := repository.GetMessageByID(instanceA, "3EB0LEGACY0000000001")
		if err != nil {
			t.Fatalf("GetMessageByID() error = %v", err)
		}
		if found != nil {
			t.Fatalf("legacy row surfaced for instance A: %+v", found)
		}

		latest, _, err := repository.GetLatestMessageID(instanceA, contactA)
		if err != nil {
			t.Fatalf("GetLatestMessageID() error = %v", err)
		}
		if latest != "" {
			t.Fatalf("GetLatestMessageID = %q, want empty: an ownerless row must not answer a scoped query", latest)
		}
	})

	t.Run("cutover is refused while the composite index is missing", func(t *testing.T) {
		legacyTable(t, db)

		if err := ApplyMessageOwnershipCutover(db); err == nil {
			t.Fatal("cutover succeeded without the composite index: the table would be left with no unique guarantee")
		}

		report, err := InspectMessageOwnership(db)
		if err != nil {
			t.Fatalf("InspectMessageOwnership() error = %v", err)
		}
		if !report.LegacyUniquePresent {
			t.Fatal("a refused cutover must leave the legacy unique in place")
		}
	})

	t.Run("cutover removes only the legacy global unique and is idempotent", func(t *testing.T) {
		legacyTable(t, db)
		insertLegacyRow(t, db, "00000000-0000-4000-8000-000000000003", "3EB0LEGACY0000000003", contactA)
		expand(t, db)

		for attempt := 0; attempt < 2; attempt++ {
			if err := ApplyMessageOwnershipCutover(db); err != nil {
				t.Fatalf("ApplyMessageOwnershipCutover() attempt %d error = %v", attempt, err)
			}
		}

		report, err := InspectMessageOwnership(db)
		if err != nil {
			t.Fatalf("InspectMessageOwnership() error = %v", err)
		}
		if report.LegacyUniquePresent {
			t.Fatal("legacy global unique on message_id is still present after cutover")
		}
		if !report.CompositeIndexPresent {
			t.Fatal("cutover must not remove the composite index")
		}
		if !report.CutoverApplied {
			t.Fatal("report should describe the cutover as applied")
		}
		if report.TotalMessages != 1 {
			t.Fatalf("TotalMessages = %d, want 1: cutover must not delete history", report.TotalMessages)
		}
	})
}

func TestMessageOwnershipAfterCutover(t *testing.T) {
	db := testDB(t)

	legacyTable(t, db)
	insertLegacyRow(t, db, "00000000-0000-4000-8000-00000000000a", "3EB0LEGACYORPHAN0001", contactA)
	expand(t, db)
	if err := ApplyMessageOwnershipCutover(db); err != nil {
		t.Fatalf("ApplyMessageOwnershipCutover() error = %v", err)
	}

	repository := NewMessageRepository(db)

	t.Run("a write without an owner is refused", func(t *testing.T) {
		err := repository.InsertMessage(message_model.Message{
			MessageID: "3EB0NOOWNER000000001",
			Timestamp: "2026-09-07 10:00:00",
			Status:    "Delivered",
			Source:    contactA,
		})
		if !errors.Is(err, ErrMissingInstanceOwner) {
			t.Fatalf("InsertMessage() error = %v, want ErrMissingInstanceOwner", err)
		}
	})

	t.Run("the same message_id in A and B keeps independent rows", func(t *testing.T) {
		writeMessage(t, repository, instanceA, sharedID, "Delivered", contactA)
		writeMessage(t, repository, instanceB, sharedID, "Read", contactB)

		fromA := requireMessage(t, repository, instanceA, sharedID)
		fromB := requireMessage(t, repository, instanceB, sharedID)

		if fromA.Id == fromB.Id {
			t.Fatal("both instances resolved to the same row: ids collided across instances")
		}
		if fromA.Status != "Delivered" || fromA.Source != contactA {
			t.Fatalf("row of A = %+v, want its own metadata", fromA)
		}
		if fromB.Status != "Read" || fromB.Source != contactB {
			t.Fatalf("row of B = %+v, want its own metadata", fromB)
		}
	})

	t.Run("an upsert by A never rewrites the row of B", func(t *testing.T) {
		writeMessage(t, repository, instanceA, sharedID, "Played", "5511777777777")

		fromB := requireMessage(t, repository, instanceB, sharedID)
		if fromB.Status != "Read" || fromB.Source != contactB {
			t.Fatalf("row of B = %+v, want it untouched by the upsert of A", fromB)
		}

		fromA := requireMessage(t, repository, instanceA, sharedID)
		if fromA.Status != "Played" {
			t.Fatalf("row of A = %+v, want the upsert applied to its own row", fromA)
		}
	})

	t.Run("a scoped read of another instance is empty, like an unknown id", func(t *testing.T) {
		writeMessage(t, repository, instanceB, "3EB0ONLYOFB000000001", "Read", contactB)

		crossTenant, err := repository.GetMessageByID(instanceA, "3EB0ONLYOFB000000001")
		if err != nil {
			t.Fatalf("GetMessageByID() error = %v", err)
		}
		unknown, err := repository.GetMessageByID(instanceA, "3EB0DOESNOTEXIST0001")
		if err != nil {
			t.Fatalf("GetMessageByID() error = %v", err)
		}
		if crossTenant != nil || unknown != nil {
			t.Fatalf("cross-tenant = %+v, unknown = %+v; both must be empty", crossTenant, unknown)
		}
	})

	t.Run("the latest id per source is scoped to the owning instance", func(t *testing.T) {
		writeMessageAt(t, repository, instanceA, "3EB0LATESTA000000001", contactA, "2026-09-07 09:00:00")
		writeMessageAt(t, repository, instanceB, "3EB0LATESTB000000001", contactA, "2026-09-07 23:00:00")

		latestForA, _, err := repository.GetLatestMessageID(instanceA, contactA)
		if err != nil {
			t.Fatalf("GetLatestMessageID() error = %v", err)
		}
		if latestForA != "3EB0LATESTA000000001" {
			t.Fatalf("latest for A = %q, want its own message even though B has a newer one for the same contact", latestForA)
		}

		latestForB, _, err := repository.GetLatestMessageID(instanceB, contactA)
		if err != nil {
			t.Fatalf("GetLatestMessageID() error = %v", err)
		}
		if latestForB != "3EB0LATESTB000000001" {
			t.Fatalf("latest for B = %q, want its own message", latestForB)
		}
	})

	t.Run("a scoped read requires an owner", func(t *testing.T) {
		if _, err := repository.GetMessageByID("", sharedID); !errors.Is(err, ErrMissingInstanceOwner) {
			t.Fatalf("GetMessageByID(\"\") error = %v, want ErrMissingInstanceOwner", err)
		}
		if _, _, err := repository.GetLatestMessageID("", contactA); !errors.Is(err, ErrMissingInstanceOwner) {
			t.Fatalf("GetLatestMessageID(\"\") error = %v, want ErrMissingInstanceOwner", err)
		}
	})

	t.Run("deleting an instance removes only its own rows and keeps legacy stock", func(t *testing.T) {
		removed, err := repository.DeleteMessagesByInstance(instanceA)
		if err != nil {
			t.Fatalf("DeleteMessagesByInstance() error = %v", err)
		}
		if removed == 0 {
			t.Fatal("DeleteMessagesByInstance removed nothing: the old filter by `source` never matched an instance id")
		}

		if found := requireMessage(t, repository, instanceB, sharedID); found.Status != "Read" {
			t.Fatalf("row of B = %+v, want it preserved", found)
		}

		report, err := InspectMessageOwnership(db)
		if err != nil {
			t.Fatalf("InspectMessageOwnership() error = %v", err)
		}
		if report.MessagesWithoutOwner != 1 {
			t.Fatalf("MessagesWithoutOwner = %d, want 1: legacy history is preserved, not deleted", report.MessagesWithoutOwner)
		}
	})
}

func writeMessage(t *testing.T, repository MessageRepository, instanceID, messageID, status, source string) {
	t.Helper()
	writeMessageWithStatus(t, repository, instanceID, messageID, status, source, "2026-09-07 10:00:00")
}

func writeMessageAt(t *testing.T, repository MessageRepository, instanceID, messageID, source, timestamp string) {
	t.Helper()
	writeMessageWithStatus(t, repository, instanceID, messageID, "Delivered", source, timestamp)
}

func writeMessageWithStatus(
	t *testing.T,
	repository MessageRepository,
	instanceID, messageID, status, source, timestamp string,
) {
	t.Helper()

	err := repository.InsertMessage(message_model.Message{
		InstanceID: instanceID,
		MessageID:  messageID,
		Timestamp:  timestamp,
		Status:     status,
		Source:     source,
	})
	if err != nil {
		t.Fatalf("InsertMessage(%s/%s) error = %v", instanceID, messageID, err)
	}
}

func requireMessage(
	t *testing.T,
	repository MessageRepository,
	instanceID, messageID string,
) *message_model.Message {
	t.Helper()

	found, err := repository.GetMessageByID(instanceID, messageID)
	if err != nil {
		t.Fatalf("GetMessageByID() error = %v", err)
	}
	if found == nil {
		t.Fatalf("GetMessageByID(%s, %s) = nil, want a row", instanceID, messageID)
	}
	return found
}
