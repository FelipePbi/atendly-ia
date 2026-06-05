package event_types

import "strings"

const (
	ALL           = "ALL"
	MESSAGE       = "MESSAGE"
	SEND_MESSAGE  = "SEND_MESSAGE"
	READ_RECEIPT  = "READ_RECEIPT"
	PRESENCE      = "PRESENCE"
	HISTORY_SYNC  = "HISTORY_SYNC"
	CHAT_PRESENCE = "CHAT_PRESENCE"
	CALL          = "CALL"
	CONNECTION    = "CONNECTION"
	LABEL         = "LABEL"
	CONTACT       = "CONTACT"
	GROUP         = "GROUP"
	NEWSLETTER    = "NEWSLETTER"
	QRCODE        = "QRCODE"
	BUTTON_CLICK  = "BUTTON_CLICK"
)

var AllEventTypes = []string{
	MESSAGE,
	SEND_MESSAGE,
	READ_RECEIPT,
	PRESENCE,
	HISTORY_SYNC,
	CHAT_PRESENCE,
	CALL,
	CONNECTION,
	LABEL,
	CONTACT,
	GROUP,
	NEWSLETTER,
	QRCODE,
	BUTTON_CLICK,
}

var validEventTypes = map[string]bool{
	ALL:           true,
	MESSAGE:       true,
	SEND_MESSAGE:  true,
	READ_RECEIPT:  true,
	PRESENCE:      true,
	HISTORY_SYNC:  true,
	CHAT_PRESENCE: true,
	CALL:          true,
	CONNECTION:    true,
	LABEL:         true,
	CONTACT:       true,
	GROUP:         true,
	NEWSLETTER:    true,
	QRCODE:        true,
	BUTTON_CLICK:  true,
}

func IsEventType(eventType string) bool {
	return validEventTypes[eventType]
}

func NormalizeSubscriptions(requested []string, existing string) ([]string, []string) {
	source := requested
	if len(source) == 0 {
		source = strings.Split(existing, ",")
	}

	seen := make(map[string]bool, len(AllEventTypes))
	subscriptions := make([]string, 0, len(source))
	var invalid []string

	for _, raw := range source {
		eventType := strings.ToUpper(strings.TrimSpace(raw))
		if eventType == "" {
			continue
		}

		if eventType == ALL {
			all := make([]string, len(AllEventTypes))
			copy(all, AllEventTypes)
			return all, invalid
		}

		if !IsEventType(eventType) {
			invalid = append(invalid, raw)
			continue
		}

		if !seen[eventType] {
			seen[eventType] = true
			subscriptions = append(subscriptions, eventType)
		}
	}

	if len(subscriptions) == 0 {
		subscriptions = append(subscriptions, MESSAGE)
	}

	return subscriptions, invalid
}
