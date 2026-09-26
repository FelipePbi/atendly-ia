package transportguard

import "testing"

// goProseExpectation is one asserted non-empty Go string literal that
// can reach a text-carrying field on the wire.
type goProseExpectation struct {
	Location string
	Content  string
	Fields   []string
}

// expectedGoProseLiterals is the set of non-empty string literals
// composed in Go source that can reach a WhatsApp number through a
// text-carrying field, asserted element by element.
//
// The Goal states there is no such literal on this tree — that the only
// literals in a carrier field are the empty placeholders of
// QuotedMessage. The AST disagrees, and by the Goal own rule the AST is
// what holds. The members fall into three kinds, and the divergence is
// declared rather than corrected, because no production file of this
// fork may be edited here:
//
//   - protocol discriminators and MIME types, which name a format to the
//     transport rather than say anything to a person;
//   - the JSON envelopes the button payloads are glued out of, whose
//     other operands are the received request body;
//   - formatting marks, the asterisks and newlines wrapped around a
//     received title and description, and the single space substituted
//     for an empty row or section title.
//
// Goal056 closed A-24, the fourth kind this set used to hold: "Ver Menu",
// a Portuguese label this transport fork substituted when the caller
// sent an empty button text, delivered to a customer number. The service
// now refuses an empty button text before composing anything, so no
// literal of that kind is derived here anymore.
//
// A literal that appears, moves or changes fails this test with its file
// and its line.
var expectedGoProseLiterals = []goProseExpectation{
	{Location: "pkg/sendMessage/service/send_service.go:964", Content: "image/jpeg", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:992", Content: "audio/ogg; codecs=opus", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:1232", Content: "video/mp4", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:1248", Content: "image/jpeg", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:1275", Content: "audio/ogg; codecs=opus", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:1740", Content: "quick_reply", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:1741", Content: "{\"display_text\":\"", Fields: []string{"ButtonParamsJSON"}},
	{Location: "pkg/sendMessage/service/send_service.go:1743", Content: "cta_copy", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:1744", Content: "{\"display_text\":\"", Fields: []string{"ButtonParamsJSON"}},
	{Location: "pkg/sendMessage/service/send_service.go:1746", Content: "cta_url", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:1747", Content: "{\"display_text\":\"", Fields: []string{"ButtonParamsJSON"}},
	{Location: "pkg/sendMessage/service/send_service.go:1749", Content: "cta_call", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:1750", Content: "{\"display_text\":\"", Fields: []string{"ButtonParamsJSON"}},
	{Location: "pkg/sendMessage/service/send_service.go:1753", Content: "payment_info", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:1765", Content: "{\"from\":\"api\",\"templateId\":", Fields: []string{"MessageParamsJSON"}},
	{Location: "pkg/sendMessage/service/send_service.go:1782", Content: "*", Fields: []string{"Text"}},
	{Location: "pkg/sendMessage/service/send_service.go:1784", Content: "\n\n", Fields: []string{"Text"}},
	{Location: "pkg/sendMessage/service/send_service.go:1962", Content: " ", Fields: []string{"Title"}},
	{Location: "pkg/sendMessage/service/send_service.go:1968", Content: " ", Fields: []string{"Title"}},
	{Location: "pkg/sendMessage/service/send_service.go:2541", Content: "image/jpeg", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:2566", Content: "video/mp4", Fields: []string{"Mimetype"}},
	{Location: "pkg/sendMessage/service/send_service.go:2600", Content: "cta_url", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:2604", Content: "cta_call", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:2608", Content: "cta_copy", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:2614", Content: "quick_reply", Fields: []string{"Name"}},
	{Location: "pkg/sendMessage/service/send_service.go:2818", Content: "image/jpeg", Fields: []string{"Mimetype"}},
}

// TestGoProseLiteralsReachingTransportAreAssertedElementByElement is the
// assertion of §2: a non-empty Go literal that reaches a customer number
// is named here, so a new one fails with its file and its line.
func TestGoProseLiteralsReachingTransportAreAssertedElementByElement(t *testing.T) {
	enumeration := enumerateRealTree(t)

	type key struct {
		location string
		content  string
	}
	expected := map[key][]string{}
	for _, want := range expectedGoProseLiterals {
		expected[key{location: want.Location, content: want.Content}] = want.Fields
	}
	seen := map[key]bool{}

	for _, literal := range enumeration.GoProseLiteralsReachingTransport() {
		id := key{
			location: positionRelativeToModuleRoot(t, literal.File, literal.Line),
			content:  literal.Content,
		}
		seen[id] = true
		fields, declared := expected[id]
		if !declared {
			t.Errorf("a non-empty Go literal reaches a text-carrying field and is not in the asserted set: %s writes %q into %v",
				id.location, literal.Content, literal.Fields)
			continue
		}
		if !sameStrings(fields, literal.Fields) {
			t.Errorf("the literal at %s reaches %v, the assertion names %v", id.location, literal.Fields, fields)
		}
	}
	for id := range expected {
		if !seen[id] {
			t.Errorf("an asserted Go literal is gone from the tree: %s used to write %q", id.location, id.content)
		}
	}
}

// TestEmptyLiteralIsItsOwnCategoryAndNotProse holds the distinction the
// Goal draws: the empty string literal is a declared placeholder, and
// the prose set never holds one.
func TestEmptyLiteralIsItsOwnCategoryAndNotProse(t *testing.T) {
	enumeration := enumerateRealTree(t)

	empties := 0
	for _, site := range enumeration.Sites {
		for _, origin := range site.FieldOrigins {
			if origin.Category == SourceEmptyPlaceholder {
				empties++
			}
		}
	}
	if empties == 0 {
		t.Fatal("no carrier field was classified as an empty placeholder; the category is not being exercised")
	}
	for _, literal := range enumeration.GoProseLiteralsReachingTransport() {
		if literal.Content == "" {
			t.Errorf("an empty literal was reported as prose at %s", literal.Position())
		}
	}
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
