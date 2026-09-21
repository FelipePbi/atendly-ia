package transportguard

import (
	"strconv"
	"strings"
	"testing"
)

// TestEnumerationReportIsWrittenOut prints the whole enumeration — every
// text carrier site with its file, its line, its message type, its
// carrier fields, its category and its origin; every transport call;
// every registered route with its computed path; and both asserted sets.
// It asserts nothing the other tests do not already assert: it exists so
// the enumeration the Goal asks for in the report can be produced by
// running the suite with -v rather than by reading the classifier.
func TestEnumerationReportIsWrittenOut(t *testing.T) {
	enumeration := enumerateRealTree(t)

	t.Logf("carrier fields derived from the proto declarations: %d", len(enumeration.CarrierFields))
	t.Logf("proto package: %s", enumeration.Paths.Proto)
	t.Logf("transport library: %s", enumeration.Paths.Library)

	t.Logf("text carrier sites: %d", len(enumeration.Sites))
	for _, site := range enumeration.Sites {
		origins := make([]string, 0, len(site.FieldOrigins))
		for _, origin := range site.FieldOrigins {
			origins = append(origins, origin.FieldName+"="+string(origin.Category))
		}
		line := positionRelativeToModuleRoot(t, site.File, site.Line) + " " + site.MessageType +
			" [" + strings.Join(origins, " ") + "] " + string(site.Category) + " " + string(site.Composition)
		if site.SendLine != 0 {
			line += " sent at " + positionRelativeToModuleRoot(t, site.SendFile, site.SendLine)
		}
		t.Log("site " + line)
	}

	t.Logf("transport calls: %d", len(enumeration.Calls))
	for _, call := range enumeration.Calls {
		t.Log("call " + positionRelativeToModuleRoot(t, call.File, call.Line) + " " + call.MessageType +
			" " + string(call.Category) + " " + string(call.Provenance))
	}

	t.Logf("registered routes: %d", len(enumeration.Routes))
	for _, route := range enumeration.Routes {
		handler := "(no production handler)"
		if route.HandlerFile != "" {
			handler = route.HandlerType + "." + route.HandlerName + " at " +
				positionRelativeToModuleRoot(t, route.HandlerFile, route.HandlerLine)
		}
		t.Log("route " + route.Method + " " + route.FullPath + " = " + strconv.Quote(route.GroupPrefix) +
			" + " + strconv.Quote(route.RegisteredPath) + " at " +
			positionRelativeToModuleRoot(t, route.File, route.Line) + " handled by " + handler)
	}

	offRelay := enumeration.OffRelaySources()
	t.Logf("carrier field writes whose origin is not the relay: %d", len(offRelay))
	for _, source := range offRelay {
		t.Log("off-relay " + positionRelativeToModuleRoot(t, source.File, source.Line) + " " +
			source.MessageType + "." + source.FieldName + " " + string(source.Category))
	}

	prose := enumeration.GoProseLiteralsReachingTransport()
	t.Logf("non-empty Go literals reaching a carrier field on the wire: %d", len(prose))
	for _, literal := range prose {
		t.Log("go-literal " + positionRelativeToModuleRoot(t, literal.File, literal.Line) + " " +
			strconv.Quote(literal.Content) + " reaches " + strings.Join(literal.Fields, ","))
	}

	counts := enumeration.SiteCountsByCategory()
	for _, category := range []SiteCategory{
		CategoryInternalWrapperSend,
		CategoryTransportClientSend,
		CategoryTransportBuilder,
		CategoryEmbeddedInLocalValue,
	} {
		t.Logf("sites in category %s: %d", category, counts[category])
	}
}
