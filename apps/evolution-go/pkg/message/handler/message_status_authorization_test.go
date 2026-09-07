package message_handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/vincent-petithory/dataurl"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
	instance_service "github.com/EvolutionAPI/evolution-go/pkg/instance/service"
	message_model "github.com/EvolutionAPI/evolution-go/pkg/message/model"
	message_service "github.com/EvolutionAPI/evolution-go/pkg/message/service"
	auth_middleware "github.com/EvolutionAPI/evolution-go/pkg/middleware"
)

const (
	instanceAId    = "11111111-1111-4111-8111-111111111111"
	instanceBId    = "22222222-2222-4222-8222-222222222222"
	instanceAToken = "token-instance-a"
	instanceBToken = "token-instance-b"
	globalApiKey   = "global-api-key"

	messageOfA = "3EB0AAAAAAAAAAAAAAAA"
	messageOfB = "3EB0BBBBBBBBBBBBBBBB"
	unknownId  = "3EB0CCCCCCCCCCCCCCCC"
)

// TestMessageStatusOwnershipOverGinChain exercita o middleware Auth real e o
// handler real registrado como em pkg/routes/routes.go:173-183.
//
// Caso de regressão do G-35: contra o handler anterior, que consultava o
// repositório apenas por message_id, "A pergunta pelo ID de B" devolvia os
// metadados de B.
func TestMessageStatusOwnershipOverGinChain(t *testing.T) {
	t.Run("A reads its own message", func(t *testing.T) {
		svc := newFakeMessageService()
		engine := newTestEngine(svc)

		res := doStatusRequest(engine, instanceAToken, `{"id":"`+messageOfA+`"}`)

		if res.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusOK, res.Body.String())
		}
		if got := decodeResult(t, res); got == nil || got.MessageID != messageOfA {
			t.Fatalf("result = %+v, want the message of A", got)
		}
		if calls := svc.statusCalls; len(calls) != 1 || calls[0].instanceId != instanceAId {
			t.Fatalf("service calls = %+v, want exactly one scoped to %s", calls, instanceAId)
		}
	})

	t.Run("A asking for the id of B is indistinguishable from an unknown id", func(t *testing.T) {
		svcCross := newFakeMessageService()
		crossTenant := doStatusRequest(
			newTestEngine(svcCross), instanceAToken, `{"id":"`+messageOfB+`"}`,
		)

		svcUnknown := newFakeMessageService()
		unknown := doStatusRequest(
			newTestEngine(svcUnknown), instanceAToken, `{"id":"`+unknownId+`"}`,
		)

		if crossTenant.Code != unknown.Code {
			t.Fatalf("status codes differ: cross-tenant %d, unknown %d", crossTenant.Code, unknown.Code)
		}
		if crossTenant.Body.String() != unknown.Body.String() {
			t.Fatalf(
				"bodies differ: cross-tenant %s, unknown %s",
				crossTenant.Body.String(), unknown.Body.String(),
			)
		}
		if got := decodeResult(t, crossTenant); got != nil {
			t.Fatalf("result = %+v, want null: no data of another instance may leak", got)
		}
		// A consulta jamais sai do escopo da instância autenticada.
		if calls := svcCross.statusCalls; len(calls) != 1 || calls[0].instanceId != instanceAId {
			t.Fatalf("service calls = %+v, want exactly one scoped to %s", calls, instanceAId)
		}
	})

	t.Run("B still reads its own message", func(t *testing.T) {
		svc := newFakeMessageService()
		res := doStatusRequest(newTestEngine(svc), instanceBToken, `{"id":"`+messageOfB+`"}`)

		if got := decodeResult(t, res); got == nil || got.MessageID != messageOfB {
			t.Fatalf("result = %+v, want the message of B", got)
		}
	})

	t.Run("missing credentials are refused without touching the store", func(t *testing.T) {
		svc := newFakeMessageService()
		res := doStatusRequest(newTestEngine(svc), "", `{"id":"`+messageOfB+`"}`)

		assertUnauthorized(t, res)
		if len(svc.statusCalls) != 0 {
			t.Fatalf("service calls = %+v, want none", svc.statusCalls)
		}
	})

	t.Run("an unknown credential is refused without touching the store", func(t *testing.T) {
		svc := newFakeMessageService()
		res := doStatusRequest(newTestEngine(svc), "token-that-does-not-exist", `{"id":"`+messageOfB+`"}`)

		assertUnauthorized(t, res)
		if len(svc.statusCalls) != 0 {
			t.Fatalf("service calls = %+v, want none", svc.statusCalls)
		}
	})

	t.Run("the global admin key does not authorize instance metadata", func(t *testing.T) {
		svc := newFakeMessageService()
		res := doStatusRequest(newTestEngine(svc), globalApiKey, `{"id":"`+messageOfB+`"}`)

		assertUnauthorized(t, res)
		if len(svc.statusCalls) != 0 {
			t.Fatalf("service calls = %+v, want none", svc.statusCalls)
		}
	})

	t.Run("extra ownership fields in the body are ignored", func(t *testing.T) {
		svc := newFakeMessageService()
		// Cliente tentando declarar o dono no corpo: o handler continua usando
		// apenas a instância autenticada.
		body := `{"id":"` + messageOfB + `","instance_id":"` + instanceBId + `","source":"` + instanceBId + `"}`
		res := doStatusRequest(newTestEngine(svc), instanceAToken, body)

		if got := decodeResult(t, res); got != nil {
			t.Fatalf("result = %+v, want null", got)
		}
		if calls := svc.statusCalls; len(calls) != 1 || calls[0].instanceId != instanceAId {
			t.Fatalf("service calls = %+v, want exactly one scoped to %s", calls, instanceAId)
		}
	})
}

func newTestEngine(svc message_service.MessageService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()

	middleware := auth_middleware.NewMiddleware(
		&config.Config{GlobalApiKey: globalApiKey},
		newFakeInstanceService(),
	)
	handler := NewMessageHandler(svc)

	routes := engine.Group("/message")
	routes.Use(middleware.Auth)
	routes.POST("/status", handler.GetMessageStatus)

	return engine
}

func doStatusRequest(engine *gin.Engine, apikey string, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/message/status", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if apikey != "" {
		request.Header.Set("apikey", apikey)
	}

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	return recorder
}

func decodeResult(t *testing.T, res *httptest.ResponseRecorder) *message_model.Message {
	t.Helper()

	var decoded struct {
		Message string `json:"message"`
		Data    struct {
			Result *message_model.Message `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("json.Unmarshal() error = %v (body %s)", err, res.Body.String())
	}
	return decoded.Data.Result
}

func assertUnauthorized(t *testing.T, res *httptest.ResponseRecorder) {
	t.Helper()

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusUnauthorized, res.Body.String())
	}
	for _, leaked := range []string{messageOfA, messageOfB, instanceAId, instanceBId} {
		if strings.Contains(res.Body.String(), leaked) {
			t.Fatalf("body leaks %q: %s", leaked, res.Body.String())
		}
	}
}

// --- dublês -----------------------------------------------------------------

type fakeInstanceService struct {
	instance_service.InstanceService

	byToken map[string]*instance_model.Instance
}

func newFakeInstanceService() *fakeInstanceService {
	return &fakeInstanceService{
		byToken: map[string]*instance_model.Instance{
			instanceAToken: {Id: instanceAId, Name: "instance-a", Token: instanceAToken},
			instanceBToken: {Id: instanceBId, Name: "instance-b", Token: instanceBToken},
		},
	}
}

func (f *fakeInstanceService) GetInstanceByToken(token string) (*instance_model.Instance, error) {
	instance, ok := f.byToken[token]
	if !ok {
		return nil, errors.New("instance not found")
	}
	return instance, nil
}

type statusCall struct {
	instanceId string
	messageId  string
}

// fakeMessageService reproduz a semântica de escopo do repositório: a busca
// acontece pelo par (instância autenticada, message_id).
type fakeMessageService struct {
	message_service.MessageService

	statusCalls []statusCall
	store       map[string]map[string]*message_model.Message
}

func newFakeMessageService() *fakeMessageService {
	return &fakeMessageService{
		store: map[string]map[string]*message_model.Message{
			instanceAId: {
				messageOfA: {
					Id:         "row-a",
					InstanceID: instanceAId,
					MessageID:  messageOfA,
					Status:     "Delivered",
					Source:     "5511999999999",
				},
			},
			instanceBId: {
				messageOfB: {
					Id:         "row-b",
					InstanceID: instanceBId,
					MessageID:  messageOfB,
					Status:     "Read",
					Source:     "5511888888888",
				},
			},
		},
	}
}

func (f *fakeMessageService) GetMessageStatus(
	data *message_service.MessageStatusStruct,
	instance *instance_model.Instance,
) (*message_model.Message, string, error) {
	if instance == nil || instance.Id == "" {
		return nil, "", errors.New("authenticated instance is required")
	}

	f.statusCalls = append(f.statusCalls, statusCall{instanceId: instance.Id, messageId: data.Id})
	return f.store[instance.Id][data.Id], "", nil
}

func (f *fakeMessageService) DownloadMedia(
	*message_service.DownloadMediaStruct,
	*instance_model.Instance,
	*http.Request,
) (*dataurl.DataURL, string, error) {
	return nil, "", errors.New("not used")
}
