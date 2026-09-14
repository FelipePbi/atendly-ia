package whatsmeow_service

import "testing"

func TestDecideMediaInline(t *testing.T) {
	const cap16MiB = 16 * 1024 * 1024

	tests := []struct {
		name           string
		sizeBytes      int
		maxInlineBytes int64
		want           bool
	}{
		{name: "below cap embeds", sizeBytes: 1024, maxInlineBytes: cap16MiB, want: true},
		{name: "exactly at cap embeds", sizeBytes: cap16MiB, maxInlineBytes: cap16MiB, want: true},
		{name: "above cap does not embed", sizeBytes: cap16MiB + 1, maxInlineBytes: cap16MiB, want: false},
		{name: "zero cap disables check, always embeds", sizeBytes: cap16MiB * 10, maxInlineBytes: 0, want: true},
		{name: "negative cap disables check, always embeds", sizeBytes: cap16MiB * 10, maxInlineBytes: -1, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := decideMediaInline(tt.sizeBytes, tt.maxInlineBytes); got != tt.want {
				t.Fatalf("decideMediaInline(%d, %d) = %v, want %v", tt.sizeBytes, tt.maxInlineBytes, got, tt.want)
			}
		})
	}
}
