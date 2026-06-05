package event_types

import (
	"reflect"
	"testing"
)

func TestNormalizeSubscriptions(t *testing.T) {
	tests := []struct {
		name        string
		requested   []string
		existing    string
		want        []string
		wantInvalid []string
	}{
		{
			name:      "empty request preserves existing events",
			existing:  "MESSAGE,CONNECTION",
			want:      []string{MESSAGE, CONNECTION},
			requested: nil,
		},
		{
			name:      "empty request and empty existing defaults to message",
			existing:  "",
			want:      []string{MESSAGE},
			requested: nil,
		},
		{
			name:      "all expands to every event type",
			requested: []string{ALL},
			want:      AllEventTypes,
		},
		{
			name:        "invalid events are discarded and reported",
			requested:   []string{"MESSAGE", "INVALID", "MESSAGE", "connection"},
			want:        []string{MESSAGE, CONNECTION},
			wantInvalid: []string{"INVALID"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, invalid := NormalizeSubscriptions(tt.requested, tt.existing)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("NormalizeSubscriptions() subscriptions = %#v, want %#v", got, tt.want)
			}
			if !reflect.DeepEqual(invalid, tt.wantInvalid) {
				t.Fatalf("NormalizeSubscriptions() invalid = %#v, want %#v", invalid, tt.wantInvalid)
			}
		})
	}
}
