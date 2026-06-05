package main

import "testing"

func TestServerPort(t *testing.T) {
	t.Run("prefers server port", func(t *testing.T) {
		t.Setenv("SERVER_PORT", "4000")
		t.Setenv("PORT", "10000")

		if got := serverPort(); got != "4000" {
			t.Fatalf("serverPort() = %q, want %q", got, "4000")
		}
	})

	t.Run("falls back to render port", func(t *testing.T) {
		t.Setenv("SERVER_PORT", "")
		t.Setenv("PORT", "10000")

		if got := serverPort(); got != "10000" {
			t.Fatalf("serverPort() = %q, want %q", got, "10000")
		}
	})

	t.Run("uses deterministic default", func(t *testing.T) {
		t.Setenv("SERVER_PORT", "")
		t.Setenv("PORT", "")

		if got := serverPort(); got != "8080" {
			t.Fatalf("serverPort() = %q, want %q", got, "8080")
		}
	})
}
