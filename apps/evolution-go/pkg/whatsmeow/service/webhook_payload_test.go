package whatsmeow_service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// O segredo da instancia nao pode voltar ao payload de evento.
//
// O consumer da Atendly deixou de aceitar `instanceToken` do corpo no Goal003 —
// a credencial de resposta vem do vinculo persistido. Manter o campo no
// produtor so mantinha o segredo circulando por webhook, log e fila. Este teste
// e um guarda de regressao sobre a montagem dos eventos: qualquer ponto novo
// que volte a incluir o token falha aqui.
func TestEventPayloadsDoNotCarryInstanceToken(t *testing.T) {
	files := []string{
		filepath.Join("whatsmeow.go"),
		filepath.Join("..", "..", "sendMessage", "service", "send_service.go"),
	}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("reading %s: %v", file, err)
		}
		if strings.Contains(string(content), "instanceToken") {
			t.Errorf("%s still puts instanceToken in an event payload", file)
		}
	}
}

// O par instanceId/instanceName continua no payload: ele identifica a origem do
// evento e nao e credencial.
func TestEventPayloadsKeepInstanceIdentity(t *testing.T) {
	content, err := os.ReadFile("whatsmeow.go")
	if err != nil {
		t.Fatalf("reading whatsmeow.go: %v", err)
	}
	for _, field := range []string{`postMap["instanceId"]`, `postMap["instanceName"]`} {
		if !strings.Contains(string(content), field) {
			t.Errorf("event payload no longer carries %s", field)
		}
	}
}
