package transportguard

import (
	"path/filepath"
	"strconv"
	"testing"
)

// carrierWriteExpectation is one asserted member of a set the guard
// computes: the source position, the message type, the carrier field and
// the named category. The position is written relative to the module
// root so the assertion reads the same on every machine.
type carrierWriteExpectation struct {
	Location    string
	MessageType string
	FieldName   string
	Category    SourceCategory
}

// expectedOffRelaySources is the set of carrier field writes whose value
// is not the relayed request body, as the guard computes it over this
// tree, asserted element by element.
//
// Two facts are declared here rather than hidden.
//
// The Goal states this set has one member, the reject-call message. The
// AST finds more, and by the Goal own rule the AST number is the one
// that holds. The difference comes from two places: the Goal counted
// only text a person reads, while the carrier field set is derived from
// the proto declarations and therefore holds every *string field a
// message declares — a media URL, a direct path, a MIME type; and the
// round-1 guard exempted the whole "computed by a library call"
// category from this set, which is the exemption this assertion no
// longer makes.
//
// The set is therefore large, and that is the point: every member is
// named, and a member that appears, moves or changes category fails
// this test with its file and its line.
var expectedOffRelaySources = []carrierWriteExpectation{
	{Location: "pkg/message/service/message_service.go:171", MessageType: "ReactionMessage", FieldName: "Text", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1035", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1036", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1037", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1045", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1046", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1048", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1059", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1060", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1061", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1068", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1069", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1071", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1081", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1082", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1083", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1089", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1090", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1092", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1102", MessageType: "AudioMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1104", MessageType: "AudioMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1105", MessageType: "AudioMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1112", MessageType: "AudioMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1114", MessageType: "AudioMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1116", MessageType: "AudioMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1129", MessageType: "DocumentMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1130", MessageType: "DocumentMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1131", MessageType: "DocumentMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1139", MessageType: "DocumentMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1140", MessageType: "DocumentMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1142", MessageType: "DocumentMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1319", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1320", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1321", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1329", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1330", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1332", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1343", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1344", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1345", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1352", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1353", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1355", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1365", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1366", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1367", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1373", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1374", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1376", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1386", MessageType: "AudioMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1388", MessageType: "AudioMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1389", MessageType: "AudioMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1398", MessageType: "AudioMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1400", MessageType: "AudioMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1402", MessageType: "AudioMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1415", MessageType: "DocumentMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1418", MessageType: "DocumentMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1419", MessageType: "DocumentMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1425", MessageType: "DocumentMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1428", MessageType: "DocumentMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1430", MessageType: "DocumentMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1587", MessageType: "StickerMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1588", MessageType: "StickerMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1657", MessageType: "ContactMessage", FieldName: "Vcard", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:1758", MessageType: "InteractiveMessage_NativeFlowMessage_NativeFlowButton", FieldName: "Name", Category: SourceGoLiteral},
	{Location: "pkg/sendMessage/service/send_service.go:1759", MessageType: "InteractiveMessage_NativeFlowMessage_NativeFlowButton", FieldName: "ButtonParamsJSON", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1775", MessageType: "InteractiveMessage_NativeFlowMessage", FieldName: "MessageParamsJSON", Category: SourceComposedByConcatenation},
	{Location: "pkg/sendMessage/service/send_service.go:1791", MessageType: "InteractiveMessage_Body", FieldName: "Text", Category: SourceComposedByConcatenation},
	{Location: "pkg/sendMessage/service/send_service.go:1796", MessageType: "InteractiveMessage_NativeFlowMessage", FieldName: "MessageParamsJSON", Category: SourceComposedByConcatenation},
	{Location: "pkg/sendMessage/service/send_service.go:1975", MessageType: "ListMessage_Row", FieldName: "Title", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1977", MessageType: "ListMessage_Row", FieldName: "RowID", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:1981", MessageType: "ListMessage_Section", FieldName: "Title", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:2538", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2539", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2541", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceGoLiteral},
	{Location: "pkg/sendMessage/service/send_service.go:2563", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2564", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2566", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceGoLiteral},
	{Location: "pkg/sendMessage/service/send_service.go:2619", MessageType: "InteractiveMessage_NativeFlowMessage_NativeFlowButton", FieldName: "Name", Category: SourceGoLiteral},
	{Location: "pkg/sendMessage/service/send_service.go:2620", MessageType: "InteractiveMessage_NativeFlowMessage_NativeFlowButton", FieldName: "ButtonParamsJSON", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2844", MessageType: "ImageMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2845", MessageType: "ImageMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2847", MessageType: "ImageMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/sendMessage/service/send_service.go:2856", MessageType: "VideoMessage", FieldName: "URL", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2857", MessageType: "VideoMessage", FieldName: "DirectPath", Category: SourceLibraryComputedValue},
	{Location: "pkg/sendMessage/service/send_service.go:2859", MessageType: "VideoMessage", FieldName: "Mimetype", Category: SourceBranchDependent},
	{Location: "pkg/whatsmeow/service/whatsmeow.go:1806", MessageType: "ExtendedTextMessage", FieldName: "Text", Category: SourceInstanceConfig},
}

// relativeToModuleRoot renders an absolute source position the way the
// asserted sets spell it: forward-slashed and relative to the module
// root the enumeration was run over.
func relativeToModuleRoot(t *testing.T, absolute string) string {
	t.Helper()
	root, err := filepath.Abs(evolutionGoRootFromPackage)
	if err != nil {
		t.Fatalf("could not resolve the module root: %v", err)
	}
	relative, err := filepath.Rel(root, absolute)
	if err != nil {
		t.Fatalf("could not relativize %s: %v", absolute, err)
	}
	return filepath.ToSlash(relative)
}

// positionRelativeToModuleRoot renders a "file:line" position with the
// file part relative to the module root.
func positionRelativeToModuleRoot(t *testing.T, file string, line int) string {
	t.Helper()
	return relativeToModuleRoot(t, file) + ":" + strconv.Itoa(line)
}

// TestOffRelaySourceSetIsAssertedElementByElement is the assertion §2
// asks for: the set of writes whose origin is not the relay is named
// member by member, so a new one fails here with its file and its line
// instead of passing unnoticed.
func TestOffRelaySourceSetIsAssertedElementByElement(t *testing.T) {
	enumeration := enumerateRealTree(t)

	sources := enumeration.OffRelaySources()
	actual := make([]carrierWriteExpectation, 0, len(sources))
	for _, source := range sources {
		actual = append(actual, carrierWriteExpectation{
			Location:    positionRelativeToModuleRoot(t, source.File, source.Line),
			MessageType: source.MessageType,
			FieldName:   source.FieldName,
			Category:    source.Category,
		})
	}

	asserted := map[carrierWriteExpectation]bool{}
	for _, want := range expectedOffRelaySources {
		asserted[want] = true
	}
	found := map[carrierWriteExpectation]bool{}
	for _, got := range actual {
		found[got] = true
	}
	for _, got := range actual {
		if !asserted[got] {
			t.Errorf("a carrier field write whose origin is not the relay is not in the asserted set: %s writes %s.%s with origin %s",
				got.Location, got.MessageType, got.FieldName, got.Category)
		}
	}
	for _, want := range expectedOffRelaySources {
		if !found[want] {
			t.Errorf("an asserted off-relay write is gone from the tree: %s wrote %s.%s with origin %s",
				want.Location, want.MessageType, want.FieldName, want.Category)
		}
	}
	if len(actual) != len(expectedOffRelaySources) {
		t.Errorf("the off-relay set has %d members, the assertion names %d", len(actual), len(expectedOffRelaySources))
	}
}

// TestTheInstanceConfigurationSourceIsTheRejectCallMessage holds the one
// member the Goal names by hand: the auto-reject message, whose text is
// instance configuration rather than anything the route received.
func TestTheInstanceConfigurationSourceIsTheRejectCallMessage(t *testing.T) {
	enumeration := enumerateRealTree(t)

	var configured []OffRelaySource
	for _, source := range enumeration.OffRelaySources() {
		if source.Category == SourceInstanceConfig {
			configured = append(configured, source)
		}
	}
	if len(configured) != 1 {
		for _, source := range configured {
			t.Logf("instance configuration source: %s writes %s.%s",
				positionRelativeToModuleRoot(t, source.File, source.Line), source.MessageType, source.FieldName)
		}
		t.Fatalf("expected exactly one carrier field written from instance configuration, found %d", len(configured))
	}

	only := configured[0]
	location := positionRelativeToModuleRoot(t, only.File, only.Line)
	const expectedLocation = "pkg/whatsmeow/service/whatsmeow.go:1806"
	if location != expectedLocation {
		t.Errorf("the instance configuration source moved: expected %s, found %s", expectedLocation, location)
	}
	if only.MessageType != "ExtendedTextMessage" || only.FieldName != "Text" {
		t.Errorf("the instance configuration source writes %s.%s, expected ExtendedTextMessage.Text", only.MessageType, only.FieldName)
	}
	if only.Reason == "" {
		t.Error("the instance configuration source carries no written reason")
	}
}
