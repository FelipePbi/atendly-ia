package transportguard

import (
	"os"
	"regexp"
	"strconv"
	"strings"
)

// TextualSearchCounts are the figures a plain text search over the
// production tree produces. They exist to be compared against the AST
// enumeration, never to stand in for it: a text search counts spellings,
// the enumeration counts values that reach the wire, and where the two
// disagree the enumeration is the number that holds.
type TextualSearchCounts struct {
	// SendMessageCallLines is the number of production lines containing
	// the text ".SendMessage(".
	SendMessageCallLines int
	// ProtoMessageLiterals is the number of occurrences of a composite
	// literal spelled "waE2E.<something>Message{".
	ProtoMessageLiterals int
	// ProtoMessageLiteralsByFile breaks ProtoMessageLiterals down by file.
	ProtoMessageLiteralsByFile map[string]int
}

// sendCallSearchText and protoMessageLiteralPattern are the two searches
// the Goal quotes. They exist only so the enumeration can be checked
// against them. No classification rule reads either one: they are
// spellings, and a spelling never decides a category here.
const sendCallSearchText = ".SendMessage("

var protoMessageLiteralPattern = regexp.MustCompile(`waE2E\.[A-Za-z0-9_]*Message\{`)

// CountTextualSearchHits runs the Goal's two text searches over exactly
// the files the enumeration reads, so the comparison is over one tree and
// one file set rather than over two different greps.
func CountTextualSearchHits(evolutionGoRoot string) (TextualSearchCounts, error) {
	paths, err := discoverAnalysedFiles(evolutionGoRoot)
	if err != nil {
		return TextualSearchCounts{}, err
	}
	counts := TextualSearchCounts{ProtoMessageLiteralsByFile: map[string]int{}}
	for _, path := range paths {
		content, err := os.ReadFile(path)
		if err != nil {
			return TextualSearchCounts{}, err
		}
		text := string(content)
		for _, line := range strings.Split(text, "\n") {
			if strings.Contains(line, sendCallSearchText) {
				counts.SendMessageCallLines++
			}
		}
		hits := len(protoMessageLiteralPattern.FindAllString(text, -1))
		if hits > 0 {
			counts.ProtoMessageLiteralsByFile[path] = hits
			counts.ProtoMessageLiterals += hits
		}
	}
	return counts, nil
}

// SiteCountsByCategory counts the enumerated carrier literals per named
// category.
func (e *Enumeration) SiteCountsByCategory() map[SiteCategory]int {
	counts := map[SiteCategory]int{}
	for _, site := range e.Sites {
		counts[site.Category]++
	}
	return counts
}

// CallCountsByCategory counts the enumerated transport calls per named
// category.
func (e *Enumeration) CallCountsByCategory() map[SiteCategory]int {
	counts := map[SiteCategory]int{}
	for _, call := range e.Calls {
		counts[call.Category]++
	}
	return counts
}

// Report renders the whole enumeration as one line per site and one line
// per call, each naming its file, line, message type, carrier fields and
// category, with the reason that put it there.
func (e *Enumeration) Report() string {
	var b strings.Builder
	b.WriteString("carrier fields derived: " + strconv.Itoa(len(e.CarrierFields)) + "\n")
	b.WriteString("proto package: " + e.Paths.Proto + "\n")
	b.WriteString("transport library: " + e.Paths.Library + "\n")
	b.WriteString("text carrier sites: " + strconv.Itoa(len(e.Sites)) + "\n")
	for _, site := range e.Sites {
		b.WriteString("  site " + site.Position() + " " + site.MessageType +
			" [" + strings.Join(site.CarrierFields, " ") + "] " +
			string(site.Category) + " " + string(site.Composition))
		if site.SendLine != 0 {
			b.WriteString(" sent at " + site.SendFile + ":" + strconv.Itoa(site.SendLine))
		}
		b.WriteString(" — " + site.Reason + "\n")
	}
	b.WriteString("transport calls: " + strconv.Itoa(len(e.Calls)) + "\n")
	for _, call := range e.Calls {
		b.WriteString("  call " + call.Position() + " " + call.MessageType + " " +
			string(call.Category) + " " + string(call.Provenance) +
			" — " + call.Reason + "\n")
	}
	return b.String()
}
