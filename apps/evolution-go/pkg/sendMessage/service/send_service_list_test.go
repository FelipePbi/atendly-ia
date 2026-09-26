package send_service

import (
	"testing"

	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
)

func TestSendList_EmptyButtonText_ReturnsErrorBeforeUsingClient(t *testing.T) {
	s := &sendService{}
	data := &ListStruct{
		Number:      "5582988898565",
		Title:       "Nossos planos",
		Description: "Escolha o plano ideal",
		FooterText:  "Evolution GO",
		ButtonText:  "",
		Sections: []Section{
			{Title: "Planos", Rows: []Row{{Title: "Basico", RowId: "1"}}},
		},
	}
	instance := &instance_model.Instance{Id: "test-instance"}

	message, err := s.SendList(data, instance)

	if err == nil {
		t.Fatal("expected error for empty ButtonText, got nil")
	}
	if err.Error() != "button text is required" {
		t.Fatalf("expected 'button text is required', got %q", err.Error())
	}
	if message != nil {
		t.Fatalf("expected nil message on error, got %v", message)
	}
}
