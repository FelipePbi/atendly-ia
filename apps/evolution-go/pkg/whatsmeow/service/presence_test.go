package whatsmeow_service

import (
	"testing"

	"go.mau.fi/whatsmeow/types"
)

// D-205: ao conectar, o aparelho vinculado só fica online com alwaysOnline.
// Online, o WhatsApp para de notificar o celular do dono.
func TestConnectPresence(t *testing.T) {
	if got := connectPresence(false); got != types.PresenceUnavailable {
		t.Fatalf("default must be unavailable, got %q", got)
	}
	if got := connectPresence(true); got != types.PresenceAvailable {
		t.Fatalf("alwaysOnline must be available, got %q", got)
	}
}
