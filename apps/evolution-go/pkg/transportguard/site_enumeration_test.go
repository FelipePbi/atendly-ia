package transportguard

import (
	"os"
	"strings"
	"testing"
)

// evolutionGoRootFromPackage is the module root seen from this package
// directory. It is a path, not a rule: nothing in the discoverer is keyed
// on a file or folder name.
const evolutionGoRootFromPackage = "../.."

func enumerateRealTree(t *testing.T) *Enumeration {
	t.Helper()
	enumeration, err := Enumerate(evolutionGoRootFromPackage)
	if err != nil {
		t.Fatalf("enumeration left residue on the real tree: %v", err)
	}
	return enumeration
}

// TestEnumerationLeavesNoResidueOnTheRealTree is the zero-residue
// requirement itself: Enumerate returns an error naming "file:line" for
// any shape it cannot account for, so a successful run over the whole
// production tree is the proof that nothing passed in silence.
func TestEnumerationLeavesNoResidueOnTheRealTree(t *testing.T) {
	enumeration := enumerateRealTree(t)

	if len(enumeration.Sites) == 0 {
		t.Fatal("no text carrier site was enumerated; the discoverer is not reading the tree")
	}
	if len(enumeration.Calls) == 0 {
		t.Fatal("no transport call was enumerated; the discoverer is not reading the tree")
	}
}

// TestEverySiteCarriesItsOwnEvidence checks the shape of the enumeration
// output: file, line, message type, carrier field, named category and the
// written reason, one per site.
func TestEverySiteCarriesItsOwnEvidence(t *testing.T) {
	enumeration := enumerateRealTree(t)

	for _, site := range enumeration.Sites {
		switch {
		case site.File == "" || site.Line == 0:
			t.Errorf("site without a source position: %+v", site)
		case site.MessageType == "":
			t.Errorf("site %s without a message type", site.Position())
		case len(site.CarrierFields) == 0:
			t.Errorf("site %s without a carrier field; it should not have been enumerated", site.Position())
		case site.Category == "":
			t.Errorf("site %s without a named category", site.Position())
		case site.Composition == "":
			t.Errorf("site %s without a named composition", site.Position())
		case site.Reason == "":
			t.Errorf("site %s without a written reason", site.Position())
		}
		if site.Category != CategoryEmbeddedInLocalValue && site.SendLine == 0 {
			t.Errorf("site %s in category %s without the send call that carries it", site.Position(), site.Category)
		}
	}

	for _, call := range enumeration.Calls {
		if call.File == "" || call.Line == 0 || call.Category == "" || call.Provenance == "" || call.Reason == "" {
			t.Errorf("transport call without full evidence: %+v", call)
		}
	}
}

// TestWrapperAndClientSendsAreDistinctCategories holds the distinction the
// Goal asks for: a call to the service's own forwarding method and a call
// to the transport library client are not the same event, and both are
// present on the real tree.
func TestWrapperAndClientSendsAreDistinctCategories(t *testing.T) {
	enumeration := enumerateRealTree(t)
	byCategory := enumeration.CallCountsByCategory()

	if byCategory[CategoryInternalWrapperSend] == 0 {
		t.Error("no call landed in the internal wrapper category")
	}
	if byCategory[CategoryTransportClientSend] == 0 {
		t.Error("no call landed in the transport client category")
	}
	if CategoryInternalWrapperSend == CategoryTransportClientSend {
		t.Fatal("the two send categories must be distinct names")
	}
}

// TestTextualSearchFiguresAreCheckedAgainstTheAST performs the
// reconciliation the Goal requires. The text search figures quoted in the
// Goal are 19 lines of ".SendMessage(" and 69 literals of
// "waE2E.*Message{". Where the two disagree, the AST enumeration is the
// number that holds, and this test states the divergence rather than
// hiding it.
func TestTextualSearchFiguresAreCheckedAgainstTheAST(t *testing.T) {
	enumeration := enumerateRealTree(t)
	textual, err := CountTextualSearchHits(evolutionGoRootFromPackage)
	if err != nil {
		t.Fatalf("textual search over the production tree failed: %v", err)
	}

	const goalSendMessageLines = 19
	const goalProtoMessageLiterals = 69

	if textual.SendMessageCallLines != goalSendMessageLines {
		t.Logf("divergence: the Goal quotes %d lines of %q, the same search now finds %d",
			goalSendMessageLines, sendCallSearchText, textual.SendMessageCallLines)
	}
	if len(enumeration.Calls) != textual.SendMessageCallLines {
		t.Logf("divergence: text search finds %d lines of %q, the AST enumerates %d transport calls; the AST number holds",
			textual.SendMessageCallLines, sendCallSearchText, len(enumeration.Calls))
	}
	if len(enumeration.Calls) != goalSendMessageLines {
		t.Logf("divergence: the Goal quotes %d send sites, the AST enumerates %d transport calls; the AST number holds",
			goalSendMessageLines, len(enumeration.Calls))
	}

	if textual.ProtoMessageLiterals != goalProtoMessageLiterals {
		t.Logf("divergence: the Goal quotes %d literals of %q, the same search now finds %d",
			goalProtoMessageLiterals, protoMessageLiteralPattern.String(), textual.ProtoMessageLiterals)
	}
	if len(enumeration.Sites) != textual.ProtoMessageLiterals {
		t.Logf("divergence: text search finds %d proto message literals, the AST enumerates %d carrier literals; the AST number holds",
			textual.ProtoMessageLiterals, len(enumeration.Sites))
	}

	// The reconciliation is only meaningful if both counts are actually
	// produced; a zero on either side means a search that read nothing.
	if textual.SendMessageCallLines == 0 || textual.ProtoMessageLiterals == 0 {
		t.Fatal("the textual search read nothing, so no comparison was made")
	}
}

// TestNoRuleIsKeyedOnAFileFolderFunctionRouteOrReceiver guards the rule
// the Goal calls a blocker: the classification must come from shape. The
// package source is read back and checked for string literals that spell
// out a path, a route or a receiver of the tree being analysed.
func TestNoRuleIsKeyedOnAFileFolderFunctionRouteOrReceiver(t *testing.T) {
	sources, err := packageSourcesUnderTest()
	if err != nil {
		t.Fatalf("could not read the guard's own sources: %v", err)
	}

	// Names of the tree under analysis. None of them may appear in a
	// classification rule; the discoverer derives every one of them.
	forbidden := []string{
		"sendMessage", "send_service", "message_service", "chat_service",
		"whatsmeow.go", "sendService", "messageService", "chatService",
		"SendText", "SendMedia", "SendPoll", "clientPointer", "WAClient",
	}
	for path, content := range sources {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		for _, name := range forbidden {
			if strings.Contains(content, name) {
				t.Errorf("%s mentions %q; classification must be by shape, not by name", path, name)
			}
		}
	}
}

// packageSourcesUnderTest reads this package's own .go files, so the rule
// about not naming names is checked against the shipped source instead of
// being asserted in a comment.
func packageSourcesUnderTest() (map[string]string, error) {
	entries, err := os.ReadDir(".")
	if err != nil {
		return nil, err
	}
	sources := map[string]string{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			continue
		}
		content, err := os.ReadFile(entry.Name())
		if err != nil {
			return nil, err
		}
		sources[entry.Name()] = string(content)
	}
	return sources, nil
}
