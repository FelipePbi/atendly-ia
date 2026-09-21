package transportguard

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
)

// TransportPackagePaths are the two import paths this guard reasons about:
// the transport library whose client puts bytes on the wire, and the proto
// package whose message structs carry the text. Both are derived from the
// module file and from CarrierProtoFileRelPath — neither is written here.
type TransportPackagePaths struct {
	// Library is the import path of the transport library, e.g. the module
	// path the go.mod "replace" directive redirects to the vendorized tree
	// that holds CarrierProtoFileRelPath.
	Library string
	// Proto is the import path of the generated message package, i.e.
	// Library joined with the directory of CarrierProtoFileRelPath below
	// the vendorized tree root.
	Proto string
}

// DeriveTransportPackagePaths reads evolutionGoRoot/go.mod, finds the
// "replace" directive whose local target is the vendorized subtree that
// contains CarrierProtoFileRelPath, and rebuilds both import paths from
// it. A module that stops vendorizing the library, or a proto file that
// moves, makes this fail loudly instead of silently matching nothing.
func DeriveTransportPackagePaths(evolutionGoRoot string) (TransportPackagePaths, error) {
	vendorDir, protoSubdir := splitCarrierProtoRelPath()

	goModPath := filepath.Join(evolutionGoRoot, "go.mod")
	content, err := os.ReadFile(goModPath)
	if err != nil {
		return TransportPackagePaths{}, err
	}

	library := ""
	for _, line := range strings.Split(string(content), "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		// "replace <module> => <target>" — the only form this tree uses.
		if len(fields) != 4 || fields[0] != "replace" || fields[2] != "=>" {
			continue
		}
		target := strings.TrimPrefix(strings.TrimPrefix(fields[3], "./"), ".\\")
		if filepath.ToSlash(target) != vendorDir {
			continue
		}
		library = fields[1]
		break
	}
	if library == "" {
		return TransportPackagePaths{}, &GuardError{
			Location: goModPath,
			Message: "no \"replace\" directive redirects to " + vendorDir +
				", so the transport library import path cannot be derived",
		}
	}

	return TransportPackagePaths{
		Library: library,
		Proto:   library + "/" + protoSubdir,
	}, nil
}

// splitCarrierProtoRelPath splits CarrierProtoFileRelPath into the
// vendorized tree root ("whatsmeow-lib") and the package directory below
// it ("proto/waE2E").
func splitCarrierProtoRelPath() (vendorDir string, protoSubdir string) {
	parts := strings.Split(filepath.ToSlash(filepath.Dir(CarrierProtoFileRelPath)), "/")
	return parts[0], strings.Join(parts[1:], "/")
}

// ModuleImportPath reads the "module" line of evolutionGoRoot/go.mod.
func ModuleImportPath(evolutionGoRoot string) (string, error) {
	goModPath := filepath.Join(evolutionGoRoot, "go.mod")
	content, err := os.ReadFile(goModPath)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(content), "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) == 2 && fields[0] == "module" {
			return fields[1], nil
		}
	}
	return "", &GuardError{Location: goModPath, Message: "no module line"}
}

// guardOwnDir is the directory of this package inside evolutionGoRoot,
// computed from the module path in go.mod and this package's own import
// path. The guard reads production code; reading itself would count its
// own search strings as findings.
func guardOwnDir(evolutionGoRoot string) (string, error) {
	modulePath, err := ModuleImportPath(evolutionGoRoot)
	if err != nil {
		return "", err
	}
	ownPath := reflect.TypeOf(Enumeration{}).PkgPath()
	relative := strings.TrimPrefix(strings.TrimPrefix(ownPath, modulePath), "/")
	if relative == "" || relative == ownPath {
		return "", nil
	}
	return filepath.Join(evolutionGoRoot, filepath.FromSlash(relative)), nil
}

// discoverAnalysedFiles is DiscoverProductionGoFiles minus this package's
// own files, which are not part of the tree under analysis.
func discoverAnalysedFiles(evolutionGoRoot string) ([]string, error) {
	paths, err := DiscoverProductionGoFiles(evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	ownDir, err := guardOwnDir(evolutionGoRoot)
	if err != nil {
		return nil, err
	}
	if ownDir == "" {
		return paths, nil
	}
	absOwnDir, err := filepath.Abs(ownDir)
	if err != nil {
		return nil, err
	}
	var kept []string
	for _, path := range paths {
		if filepath.Dir(path) == absOwnDir {
			continue
		}
		kept = append(kept, path)
	}
	return kept, nil
}

// GuardError is a failure that names the exact source location that the
// guard could not account for, so an unrecognized shape is reported as
// "file:line" instead of passing in silence.
type GuardError struct {
	Location string
	Message  string
}

func (e *GuardError) Error() string {
	return e.Location + ": " + e.Message
}

// positionOf renders a node position as the "file:line" form every guard
// failure and every enumerated site uses.
func positionOf(fset *token.FileSet, node ast.Node) token.Position {
	return fset.Position(node.Pos())
}

// importAlias returns the local name file uses for importPath, and
// whether the file imports it at all. An explicit alias wins; otherwise
// the last path segment is the package name, which holds for every
// generated proto package and for the transport library itself.
func importAlias(file *ast.File, importPath string) (string, bool) {
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil || path != importPath {
			continue
		}
		if spec.Name != nil {
			return spec.Name.Name, true
		}
		segments := strings.Split(path, "/")
		return segments[len(segments)-1], true
	}
	return "", false
}

// parseProductionFiles parses every production file once and keeps them
// keyed by absolute path, with the shared FileSet that every reported
// position resolves against.
func parseProductionFiles(paths []string) (*token.FileSet, map[string]*ast.File, error) {
	fset := token.NewFileSet()
	files := make(map[string]*ast.File, len(paths))
	for _, path := range paths {
		file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil, nil, err
		}
		files[path] = file
	}
	return fset, files, nil
}
