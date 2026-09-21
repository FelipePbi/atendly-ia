package transportguard

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"sort"
)

// CarrierProtoFileRelPath is the waE2E message definitions file whose
// struct declarations carry every text field of the domain, relative to
// the evolution-go module root.
const CarrierProtoFileRelPath = "whatsmeow-lib/proto/waE2E/WAWebProtobufsE2E.pb.go"

// CarrierProtoFilePath resolves CarrierProtoFileRelPath against
// evolutionGoRoot.
func CarrierProtoFilePath(evolutionGoRoot string) string {
	return filepath.Join(evolutionGoRoot, CarrierProtoFileRelPath)
}

// CarrierField is a *string field declared on a waE2E message struct: a
// field that can carry text.
type CarrierField struct {
	MessageType string
	FieldName   string
}

// messageStateFieldType is the field type that marks a struct declaration
// as a protobuf message (as opposed to a oneof variant wrapper, which
// carries no such field): "state protoimpl.MessageState".
const messageStateSelector = "MessageState"

// DeriveCarrierFields parses protoFilePath (a generated waE2E .go file)
// and returns every *string field declared on a message struct: a struct
// whose declaration includes a field of type protoimpl.MessageState. No
// field or message name is written by hand — every entry comes from the
// parsed declarations, sorted for a stable result.
func DeriveCarrierFields(protoFilePath string) ([]CarrierField, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, protoFilePath, nil, 0)
	if err != nil {
		return nil, err
	}

	var fields []CarrierField
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
			structType, ok := typeSpec.Type.(*ast.StructType)
			if !ok || !isMessageStruct(structType) {
				continue
			}
			for _, field := range structType.Fields.List {
				if !isStringPointerType(field.Type) {
					continue
				}
				for _, name := range field.Names {
					fields = append(fields, CarrierField{
						MessageType: typeSpec.Name.Name,
						FieldName:   name.Name,
					})
				}
			}
		}
	}

	sort.Slice(fields, func(i, j int) bool {
		if fields[i].MessageType != fields[j].MessageType {
			return fields[i].MessageType < fields[j].MessageType
		}
		return fields[i].FieldName < fields[j].FieldName
	})
	return fields, nil
}

// isMessageStruct reports whether structType declares a field whose type
// is a selector ending in "MessageState" (protoimpl.MessageState) — the
// marker protoc-gen-go emits on every real message struct, absent from
// oneof variant wrapper structs.
func isMessageStruct(structType *ast.StructType) bool {
	for _, field := range structType.Fields.List {
		selector, ok := field.Type.(*ast.SelectorExpr)
		if ok && selector.Sel.Name == messageStateSelector {
			return true
		}
	}
	return false
}

// isStringPointerType reports whether fieldType is "*string".
func isStringPointerType(fieldType ast.Expr) bool {
	star, ok := fieldType.(*ast.StarExpr)
	if !ok {
		return false
	}
	ident, ok := star.X.(*ast.Ident)
	return ok && ident.Name == "string"
}
