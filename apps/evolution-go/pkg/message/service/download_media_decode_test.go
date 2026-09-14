package message_service

import (
	"bytes"
	"encoding/json"
	"testing"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

// TestWebhookMediaMessageDecodesIntoDownloadMediaStruct proves that the `data.Message`
// object the webhook emits for a media message round-trips through JSON back into a
// DownloadMediaStruct (the shape the DownloadMedia endpoint accepts) without losing the
// media keys needed to re-download the file: URL, mediaKey, directPath, fileSHA256,
// mimetype. If this ever stops decoding, transcription/vision can only fall back to
// whatever was embedded inline as base64.
func TestWebhookMediaMessageDecodesIntoDownloadMediaStruct(t *testing.T) {
	mediaKey := []byte{0x01, 0x02, 0x03, 0x04}
	fileSHA256 := []byte{0x05, 0x06, 0x07, 0x08}

	tests := []struct {
		name    string
		message *waE2E.Message
		verify  func(t *testing.T, got *waE2E.Message)
	}{
		{
			name: "audio",
			message: &waE2E.Message{
				AudioMessage: &waE2E.AudioMessage{
					URL:        proto.String("https://mmg.whatsapp.net/v/t62.7117-24/audio.enc"),
					Mimetype:   proto.String("audio/ogg; codecs=opus"),
					MediaKey:   mediaKey,
					DirectPath: proto.String("/v/t62.7117-24/audio.enc"),
					FileSHA256: fileSHA256,
				},
			},
			verify: func(t *testing.T, got *waE2E.Message) {
				audio := got.GetAudioMessage()
				if audio == nil {
					t.Fatal("audioMessage missing after decode")
				}
				if audio.GetURL() != "https://mmg.whatsapp.net/v/t62.7117-24/audio.enc" {
					t.Errorf("URL = %q", audio.GetURL())
				}
				if audio.GetMimetype() != "audio/ogg; codecs=opus" {
					t.Errorf("Mimetype = %q", audio.GetMimetype())
				}
				if audio.GetDirectPath() != "/v/t62.7117-24/audio.enc" {
					t.Errorf("DirectPath = %q", audio.GetDirectPath())
				}
				if !bytes.Equal(audio.GetMediaKey(), mediaKey) {
					t.Errorf("MediaKey = %x, want %x", audio.GetMediaKey(), mediaKey)
				}
				if !bytes.Equal(audio.GetFileSHA256(), fileSHA256) {
					t.Errorf("FileSHA256 = %x, want %x", audio.GetFileSHA256(), fileSHA256)
				}
			},
		},
		{
			name: "image",
			message: &waE2E.Message{
				ImageMessage: &waE2E.ImageMessage{
					URL:        proto.String("https://mmg.whatsapp.net/v/t62.7118-24/image.enc"),
					Mimetype:   proto.String("image/jpeg"),
					MediaKey:   mediaKey,
					DirectPath: proto.String("/v/t62.7118-24/image.enc"),
					FileSHA256: fileSHA256,
				},
			},
			verify: func(t *testing.T, got *waE2E.Message) {
				image := got.GetImageMessage()
				if image == nil {
					t.Fatal("imageMessage missing after decode")
				}
				if image.GetURL() != "https://mmg.whatsapp.net/v/t62.7118-24/image.enc" {
					t.Errorf("URL = %q", image.GetURL())
				}
				if image.GetMimetype() != "image/jpeg" {
					t.Errorf("Mimetype = %q", image.GetMimetype())
				}
				if image.GetDirectPath() != "/v/t62.7118-24/image.enc" {
					t.Errorf("DirectPath = %q", image.GetDirectPath())
				}
				if !bytes.Equal(image.GetMediaKey(), mediaKey) {
					t.Errorf("MediaKey = %x, want %x", image.GetMediaKey(), mediaKey)
				}
				if !bytes.Equal(image.GetFileSHA256(), fileSHA256) {
					t.Errorf("FileSHA256 = %x, want %x", image.GetFileSHA256(), fileSHA256)
				}
			},
		},
		{
			name: "document",
			message: &waE2E.Message{
				DocumentMessage: &waE2E.DocumentMessage{
					URL:        proto.String("https://mmg.whatsapp.net/v/t62.7119-24/document.enc"),
					Mimetype:   proto.String("application/pdf"),
					FileName:   proto.String("contrato.pdf"),
					MediaKey:   mediaKey,
					DirectPath: proto.String("/v/t62.7119-24/document.enc"),
					FileSHA256: fileSHA256,
				},
			},
			verify: func(t *testing.T, got *waE2E.Message) {
				document := got.GetDocumentMessage()
				if document == nil {
					t.Fatal("documentMessage missing after decode")
				}
				if document.GetURL() != "https://mmg.whatsapp.net/v/t62.7119-24/document.enc" {
					t.Errorf("URL = %q", document.GetURL())
				}
				if document.GetMimetype() != "application/pdf" {
					t.Errorf("Mimetype = %q", document.GetMimetype())
				}
				if document.GetFileName() != "contrato.pdf" {
					t.Errorf("FileName = %q", document.GetFileName())
				}
				if document.GetDirectPath() != "/v/t62.7119-24/document.enc" {
					t.Errorf("DirectPath = %q", document.GetDirectPath())
				}
				if !bytes.Equal(document.GetMediaKey(), mediaKey) {
					t.Errorf("MediaKey = %x, want %x", document.GetMediaKey(), mediaKey)
				}
				if !bytes.Equal(document.GetFileSHA256(), fileSHA256) {
					t.Errorf("FileSHA256 = %x, want %x", document.GetFileSHA256(), fileSHA256)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Step 1: reproduce how the webhook builds dataMap["Message"] — it marshals
			// the *waE2E.Message the whatsmeow event carries and unmarshals it back into a
			// generic map so extra keys (base64, mediaUrl, mediaTooLarge, ...) can be added
			// alongside the proto-shaped keys (whatsmeow.go, myEventHandler).
			rawMessageJSON, err := json.Marshal(tt.message)
			if err != nil {
				t.Fatalf("marshal source message: %v", err)
			}

			var messageMap map[string]interface{}
			if err := json.Unmarshal(rawMessageJSON, &messageMap); err != nil {
				t.Fatalf("unmarshal into generic map: %v", err)
			}

			// Step 2: reproduce the metadata the webhook injects next to the media keys
			// when media is too large to embed inline.
			messageMap["mediaTooLarge"] = true
			messageMap["mediaSize"] = len(rawMessageJSON)
			messageMap["fileName"] = "wamid.example" + ".bin"

			// Step 3: this is exactly the shape `data.Message` has in the webhook body.
			// The DownloadMedia endpoint accepts a client-submitted {"message": ...} body
			// that mirrors this shape.
			webhookPayload, err := json.Marshal(map[string]interface{}{"message": messageMap})
			if err != nil {
				t.Fatalf("marshal webhook payload: %v", err)
			}

			var decoded DownloadMediaStruct
			if err := json.Unmarshal(webhookPayload, &decoded); err != nil {
				t.Fatalf("decode into DownloadMediaStruct: %v", err)
			}

			if decoded.Message == nil {
				t.Fatal("decoded.Message is nil")
			}

			tt.verify(t, decoded.Message)
		})
	}
}
