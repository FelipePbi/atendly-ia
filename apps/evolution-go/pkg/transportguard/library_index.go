package transportguard

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

// libraryIndex holds the method declarations of the transport library
// package itself. It exists for one reason: a send call may receive a
// message value that the library built (a revoke, an edit, a history
// sync request) instead of a composite literal written here, and the only
// way to know that value is a proto message — without writing the builder
// names down — is to read the library's own signatures.
type libraryIndex struct {
	dir     string
	methods map[string]map[string]*ast.FuncDecl
	scopes  map[*ast.FuncDecl]*fileScope
}

// transportLibraryDir is the package directory of the transport library
// root, derived from CarrierProtoFileRelPath: the vendorized tree root
// under evolutionGoRoot.
func transportLibraryDir(evolutionGoRoot string) string {
	vendorDir, _ := splitCarrierProtoRelPath()
	return filepath.Join(evolutionGoRoot, vendorDir)
}

// buildLibraryIndex parses the transport library root package (its own
// directory only, not its subpackages) and indexes every method by
// receiver type name.
func buildLibraryIndex(fset *token.FileSet, evolutionGoRoot string) (*libraryIndex, error) {
	dir := transportLibraryDir(evolutionGoRoot)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	index := &libraryIndex{
		dir:     dir,
		methods: map[string]map[string]*ast.FuncDecl{},
		scopes:  map[*ast.FuncDecl]*fileScope{},
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".go" || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return nil, err
		}
		scope := newFileScope(path, file)
		for _, decl := range file.Decls {
			funcDecl, ok := decl.(*ast.FuncDecl)
			if !ok || funcDecl.Recv == nil || len(funcDecl.Recv.List) == 0 {
				continue
			}
			recvType := baseTypeName(funcDecl.Recv.List[0].Type)
			if recvType == "" {
				continue
			}
			if index.methods[recvType] == nil {
				index.methods[recvType] = map[string]*ast.FuncDecl{}
			}
			index.methods[recvType][funcDecl.Name.Name] = funcDecl
			index.scopes[funcDecl] = scope
		}
	}
	return index, nil
}

// protoIndex holds the struct declarations of the generated message
// package, so a field read off a proto message ("card.Header") resolves
// to the proto type it really is instead of stopping at "unknown".
type protoIndex struct {
	dir     string
	structs map[string]*ast.StructType
	scope   *fileScope
}

func buildProtoIndex(fset *token.FileSet, evolutionGoRoot string) (*protoIndex, error) {
	path := CarrierProtoFilePath(evolutionGoRoot)
	file, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		return nil, err
	}
	index := &protoIndex{
		dir:     filepath.Dir(path),
		structs: map[string]*ast.StructType{},
		scope:   newFileScope(path, file),
	}
	for _, decl := range file.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, spec := range genDecl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			if structType, ok := typeSpec.Type.(*ast.StructType); ok {
				index.structs[typeSpec.Name.Name] = structType
			}
		}
	}
	return index, nil
}
