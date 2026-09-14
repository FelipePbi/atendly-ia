package config

import "testing"

func TestParseWebhookMediaInlineMaxBytes(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int64
	}{
		{name: "empty falls back to default", raw: "", want: DefaultWebhookMediaInlineMaxBytes},
		{name: "non numeric falls back to default", raw: "not-a-number", want: DefaultWebhookMediaInlineMaxBytes},
		{name: "zero falls back to default", raw: "0", want: DefaultWebhookMediaInlineMaxBytes},
		{name: "negative falls back to default", raw: "-1", want: DefaultWebhookMediaInlineMaxBytes},
		{name: "valid positive value is used", raw: "1048576", want: 1048576},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseWebhookMediaInlineMaxBytes(tt.raw); got != tt.want {
				t.Fatalf("parseWebhookMediaInlineMaxBytes(%q) = %d, want %d", tt.raw, got, tt.want)
			}
		})
	}
}
