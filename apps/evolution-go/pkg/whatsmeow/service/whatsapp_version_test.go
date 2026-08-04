package whatsmeow_service

import (
	"testing"

	"go.mau.fi/whatsmeow/store"
)

func TestApplyWhatsAppVersionUpdatesLoginPayload(t *testing.T) {
	original := store.GetWAVersion()
	defer store.SetWAVersion(original)

	version := clientVersion{Major: 2, Minor: 3000, Patch: 1044344916}
	applyWhatsAppVersion(version)

	want := store.WAVersionContainer{2, 3000, 1044344916}
	if got := store.GetWAVersion(); got != want {
		t.Fatalf("GetWAVersion() = %v, want %v", got, want)
	}
	if got := store.BaseClientPayload.GetUserAgent().GetAppVersion().GetTertiary(); got != uint32(version.Patch) {
		t.Fatalf("login payload patch = %d, want %d", got, version.Patch)
	}
}
