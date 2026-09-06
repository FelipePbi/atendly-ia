package instance_handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
	instance_service "github.com/EvolutionAPI/evolution-go/pkg/instance/service"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
	auth_middleware "github.com/EvolutionAPI/evolution-go/pkg/middleware"
)

const (
	instanceAId    = "11111111-1111-4111-8111-111111111111"
	instanceBId    = "22222222-2222-4222-8222-222222222222"
	unknownTarget  = "33333333-3333-4333-8333-333333333333"
	instanceAToken = "token-instance-a"
	instanceBToken = "token-instance-b"
	globalApiKey   = "global-api-key"
)

// TestAdvancedSettingsAuthorizationOverGinChain exercita o middleware Auth real e
// os handlers reais registrados como em pkg/routes/routes.go:120-133. Apenas
// GetInstanceByToken é stubado: não há banco, WhatsApp nem rede.
func TestAdvancedSettingsAuthorizationOverGinChain(t *testing.T) {
	t.Run("GET on own instance succeeds and reaches service only with the authenticated id", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		res := doRequest(engine, http.MethodGet, "/instance/"+instanceAId+"/advanced-settings", instanceAToken, "")

		if res.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusOK, res.Body.String())
		}
		if got := svc.getAdvancedCalls; len(got) != 1 || got[0] != instanceAId {
			t.Fatalf("GetAdvancedSettings calls = %v, want exactly [%s]", got, instanceAId)
		}
		if len(svc.updateAdvancedCalls) != 0 {
			t.Fatalf("UpdateAdvancedSettings calls = %v, want none", svc.updateAdvancedCalls)
		}
		if got := svc.getInstanceByTokenCalls; len(got) != 1 || got[0] != instanceAToken {
			t.Fatalf("GetInstanceByToken calls = %v, want exactly [%s]", got, instanceAToken)
		}

		var body instance_model.AdvancedSettings
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			t.Fatalf("json.Unmarshal() error = %v (body %s)", err, res.Body.String())
		}
		if body != *svc.settings[instanceAId] {
			t.Fatalf("payload = %+v, want %+v", body, *svc.settings[instanceAId])
		}
	})

	t.Run("PUT on own instance succeeds and preserves the valid body", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		payload := `{"alwaysOnline":true,"rejectCall":true,"msgRejectCall":"ocupado","readMessages":true,"ignoreGroups":true,"ignoreStatus":true}`
		res := doRequest(engine, http.MethodPut, "/instance/"+instanceAId+"/advanced-settings", instanceAToken, payload)

		if res.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusOK, res.Body.String())
		}
		if len(svc.updateAdvancedCalls) != 1 {
			t.Fatalf("UpdateAdvancedSettings calls = %v, want exactly one", svc.updateAdvancedCalls)
		}
		call := svc.updateAdvancedCalls[0]
		if call.instanceId != instanceAId {
			t.Fatalf("UpdateAdvancedSettings instanceId = %q, want %q", call.instanceId, instanceAId)
		}
		want := instance_model.AdvancedSettings{
			AlwaysOnline:  true,
			RejectCall:    true,
			MsgRejectCall: "ocupado",
			ReadMessages:  true,
			IgnoreGroups:  true,
			IgnoreStatus:  true,
		}
		if call.settings != want {
			t.Fatalf("settings = %+v, want %+v", call.settings, want)
		}

		var decoded struct {
			Message  string                          `json:"message"`
			Settings instance_model.AdvancedSettings `json:"settings"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &decoded); err != nil {
			t.Fatalf("json.Unmarshal() error = %v (body %s)", err, res.Body.String())
		}
		if decoded.Message != "Advanced settings updated successfully" {
			t.Fatalf("message = %q", decoded.Message)
		}
		if decoded.Settings != want {
			t.Fatalf("echoed settings = %+v, want %+v", decoded.Settings, want)
		}
	})

	// Caso de regressão do G-01: falha contra o handler anterior, que repassava o
	// ID da URL ao service sem compará-lo à instância autenticada.
	t.Run("GET on another instance is forbidden without touching the target", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		res := doRequest(engine, http.MethodGet, "/instance/"+instanceBId+"/advanced-settings", instanceAToken, "")

		assertForbidden(t, res)
		assertTargetNeverAccessed(t, svc)
	})

	t.Run("PUT on another instance is forbidden without touching the target", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		payload := `{"alwaysOnline":true,"ignoreGroups":true}`
		res := doRequest(engine, http.MethodPut, "/instance/"+instanceBId+"/advanced-settings", instanceAToken, payload)

		assertForbidden(t, res)
		assertTargetNeverAccessed(t, svc)
	})

	t.Run("PUT on another instance with invalid json is still refused by authorization", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		res := doRequest(engine, http.MethodPut, "/instance/"+instanceBId+"/advanced-settings", instanceAToken, `{"alwaysOnline":`)

		assertForbidden(t, res)
		assertTargetNeverAccessed(t, svc)
	})

	t.Run("PUT on own instance with invalid json keeps the existing validation and updates nothing", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		res := doRequest(engine, http.MethodPut, "/instance/"+instanceAId+"/advanced-settings", instanceAToken, `{"alwaysOnline":`)

		if res.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusBadRequest, res.Body.String())
		}
		if len(svc.updateAdvancedCalls) != 0 {
			t.Fatalf("UpdateAdvancedSettings calls = %v, want none", svc.updateAdvancedCalls)
		}
	})

	t.Run("refusal does not reveal whether the target exists", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		existing := doRequest(engine, http.MethodGet, "/instance/"+instanceBId+"/advanced-settings", instanceAToken, "")
		missing := doRequest(engine, http.MethodGet, "/instance/"+unknownTarget+"/advanced-settings", instanceAToken, "")

		if existing.Code != missing.Code {
			t.Fatalf("status for existing target = %d, for unknown target = %d; want identical", existing.Code, missing.Code)
		}
		if existing.Body.String() != missing.Body.String() {
			t.Fatalf("body for existing target = %s, for unknown target = %s; want identical", existing.Body.String(), missing.Body.String())
		}
		assertTargetNeverAccessed(t, svc)
	})

	t.Run("missing or invalid token is rejected by the middleware with 401", func(t *testing.T) {
		cases := []struct {
			name   string
			method string
			token  string
			body   string
		}{
			{name: "GET without token", method: http.MethodGet, token: ""},
			{name: "GET with unknown token", method: http.MethodGet, token: "token-unknown"},
			{name: "PUT without token", method: http.MethodPut, token: "", body: `{"alwaysOnline":true}`},
			{name: "PUT with unknown token", method: http.MethodPut, token: "token-unknown", body: `{"alwaysOnline":true}`},
			{name: "GET with global api key", method: http.MethodGet, token: globalApiKey},
			{name: "PUT with global api key", method: http.MethodPut, token: globalApiKey, body: `{"alwaysOnline":true}`},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				svc := newFakeInstanceService()
				engine := newTestEngine(svc)

				res := doRequest(engine, tc.method, "/instance/"+instanceAId+"/advanced-settings", tc.token, tc.body)

				assertUnauthorized(t, res)
				assertTargetNeverAccessed(t, svc)
			})
		}
	})
}

// TestAdvancedSettingsRejectInvalidAuthenticatedContext cobre o guard chamado
// diretamente, sem middleware, com contexto ausente, tipo inesperado, ponteiro
// nil e instância sem Id.
func TestAdvancedSettingsRejectInvalidAuthenticatedContext(t *testing.T) {
	var nilInstance *instance_model.Instance

	cases := []struct {
		name    string
		prepare func(c *gin.Context)
	}{
		{name: "context absent", prepare: func(c *gin.Context) {}},
		{name: "unexpected type", prepare: func(c *gin.Context) { c.Set("instance", "not-an-instance") }},
		{name: "value instead of pointer", prepare: func(c *gin.Context) {
			c.Set("instance", instance_model.Instance{Id: instanceAId})
		}},
		{name: "nil pointer", prepare: func(c *gin.Context) { c.Set("instance", nilInstance) }},
		{name: "nil interface", prepare: func(c *gin.Context) { c.Set("instance", nil) }},
		{name: "authenticated instance without id", prepare: func(c *gin.Context) {
			c.Set("instance", &instance_model.Instance{Id: ""})
		}},
	}

	methods := []struct {
		name   string
		method string
		body   string
		invoke func(h InstanceHandler, c *gin.Context)
	}{
		{name: "GET", method: http.MethodGet, invoke: func(h InstanceHandler, c *gin.Context) { h.GetAdvancedSettings(c) }},
		{name: "PUT", method: http.MethodPut, body: `{"alwaysOnline":true}`, invoke: func(h InstanceHandler, c *gin.Context) { h.UpdateAdvancedSettings(c) }},
	}

	for _, tc := range cases {
		for _, m := range methods {
			t.Run(m.name+"/"+tc.name, func(t *testing.T) {
				svc := newFakeInstanceService()
				handler := NewInstanceHandler(svc, testConfig())

				res := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(res)
				c.Request = newRequest(m.method, "/instance/"+instanceAId+"/advanced-settings", "", m.body)
				c.Params = gin.Params{{Key: "instanceId", Value: instanceAId}}
				tc.prepare(c)

				defer func() {
					if r := recover(); r != nil {
						t.Fatalf("handler panicked with invalid authenticated context: %v", r)
					}
				}()

				m.invoke(handler, c)

				assertUnauthorized(t, res)
				if !c.IsAborted() {
					t.Fatal("context was not aborted, remaining chain would still run")
				}
				assertTargetNeverAccessed(t, svc)
			})
		}
	}
}

// TestAdminGroupKeepsAuthAdmin garante que a correção não ampliou privilégio: a
// chave de instância continua sem acesso ao grupo administrativo e AuthAdmin não
// resolve tokens de instância.
func TestAdminGroupKeepsAuthAdmin(t *testing.T) {
	t.Run("instance token is refused by the admin group", func(t *testing.T) {
		for _, path := range []string{"/instance/all", "/instance/info/" + instanceBId, "/instance/info/" + instanceAId} {
			svc := newFakeInstanceService()
			engine := newTestEngine(svc)

			res := doRequest(engine, http.MethodGet, path, instanceAToken, "")

			if res.Code != http.StatusUnauthorized {
				t.Fatalf("%s status = %d, want %d (body %s)", path, res.Code, http.StatusUnauthorized, res.Body.String())
			}
			if svc.getAllCalls != 0 || len(svc.infoCalls) != 0 {
				t.Fatalf("%s reached admin service: getAll=%d info=%v", path, svc.getAllCalls, svc.infoCalls)
			}
			if len(svc.getInstanceByTokenCalls) != 0 {
				t.Fatalf("%s resolved an instance token in the admin group: %v", path, svc.getInstanceByTokenCalls)
			}
		}
	})

	t.Run("global api key still reaches the admin group", func(t *testing.T) {
		svc := newFakeInstanceService()
		engine := newTestEngine(svc)

		res := doRequest(engine, http.MethodGet, "/instance/all", globalApiKey, "")

		if res.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusOK, res.Body.String())
		}
		if svc.getAllCalls != 1 {
			t.Fatalf("getAll calls = %d, want 1", svc.getAllCalls)
		}
	})
}

// newTestEngine espelha o registro de pkg/routes/routes.go:120-133: grupo
// administrativo sob AuthAdmin e advanced-settings sob Auth de instância.
func newTestEngine(svc *fakeInstanceService) *gin.Engine {
	gin.SetMode(gin.TestMode)

	cfg := testConfig()
	handler := NewInstanceHandler(svc, cfg)
	middleware := auth_middleware.NewMiddleware(cfg, svc)

	engine := gin.New()

	admin := engine.Group("/instance")
	admin.Use(middleware.AuthAdmin)
	admin.GET("/all", handler.All)
	admin.GET("/info/:instanceId", handler.Info)

	instance := engine.Group("/instance")
	instance.Use(middleware.Auth)
	instance.GET("/:instanceId/advanced-settings", handler.GetAdvancedSettings)
	instance.PUT("/:instanceId/advanced-settings", handler.UpdateAdvancedSettings)

	return engine
}

func testConfig() *config.Config {
	return &config.Config{GlobalApiKey: globalApiKey}
}

func newRequest(method, path, token, body string) *http.Request {
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("apikey", token)
	}
	return req
}

func doRequest(engine *gin.Engine, method, path, token, body string) *httptest.ResponseRecorder {
	res := httptest.NewRecorder()
	engine.ServeHTTP(res, newRequest(method, path, token, body))
	return res
}

func assertUnauthorized(t *testing.T, res *httptest.ResponseRecorder) {
	t.Helper()

	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusUnauthorized, res.Body.String())
	}
	if got := strings.TrimSpace(res.Body.String()); got != `{"error":"not authorized"}` {
		t.Fatalf("body = %s, want a generic refusal", got)
	}
	assertNoSecretsLeaked(t, res.Body.String())
}

func assertForbidden(t *testing.T, res *httptest.ResponseRecorder) {
	t.Helper()

	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d (body %s)", res.Code, http.StatusForbidden, res.Body.String())
	}
	if got := strings.TrimSpace(res.Body.String()); got != `{"error":"forbidden"}` {
		t.Fatalf("body = %s, want a generic refusal", got)
	}
	assertNoSecretsLeaked(t, res.Body.String())
}

// assertTargetNeverAccessed prova que nenhuma leitura ou escrita chegou ao
// service, em vez de apenas verificar que um helper foi chamado.
func assertTargetNeverAccessed(t *testing.T, svc *fakeInstanceService) {
	t.Helper()

	if len(svc.getAdvancedCalls) != 0 {
		t.Fatalf("GetAdvancedSettings calls = %v, want none", svc.getAdvancedCalls)
	}
	if len(svc.updateAdvancedCalls) != 0 {
		t.Fatalf("UpdateAdvancedSettings calls = %v, want none", svc.updateAdvancedCalls)
	}
	if len(svc.infoCalls) != 0 {
		t.Fatalf("Info calls = %v, want none", svc.infoCalls)
	}
	if svc.getAllCalls != 0 {
		t.Fatalf("GetAll calls = %d, want none", svc.getAllCalls)
	}
}

func assertNoSecretsLeaked(t *testing.T, body string) {
	t.Helper()

	for _, secret := range []string{instanceAToken, instanceBToken, globalApiKey, instanceAId, instanceBId, unknownTarget, "instance-a", "instance-b"} {
		if strings.Contains(body, secret) {
			t.Fatalf("refusal body %q leaked %q", body, secret)
		}
	}
}

type advancedUpdateCall struct {
	instanceId string
	settings   instance_model.AdvancedSettings
}

// fakeInstanceService implementa instance_service.InstanceService registrando
// todo acesso ao alvo, sem banco, WhatsApp ou rede.
type fakeInstanceService struct {
	instancesByToken map[string]*instance_model.Instance
	settings         map[string]*instance_model.AdvancedSettings

	getInstanceByTokenCalls []string
	getAdvancedCalls        []string
	updateAdvancedCalls     []advancedUpdateCall
	infoCalls               []string
	getAllCalls             int
}

var _ instance_service.InstanceService = (*fakeInstanceService)(nil)

func newFakeInstanceService() *fakeInstanceService {
	return &fakeInstanceService{
		instancesByToken: map[string]*instance_model.Instance{
			instanceAToken: {Id: instanceAId, Name: "instance-a", Token: instanceAToken},
			instanceBToken: {Id: instanceBId, Name: "instance-b", Token: instanceBToken},
		},
		settings: map[string]*instance_model.AdvancedSettings{
			instanceAId: {AlwaysOnline: false, IgnoreGroups: true, MsgRejectCall: "a"},
			instanceBId: {AlwaysOnline: true, IgnoreStatus: true, MsgRejectCall: "b"},
		},
	}
}

func (f *fakeInstanceService) GetInstanceByToken(token string) (*instance_model.Instance, error) {
	f.getInstanceByTokenCalls = append(f.getInstanceByTokenCalls, token)

	instance, ok := f.instancesByToken[token]
	if !ok {
		return nil, errors.New("instance not found")
	}
	copy := *instance
	return &copy, nil
}

func (f *fakeInstanceService) GetAdvancedSettings(instanceId string) (*instance_model.AdvancedSettings, error) {
	f.getAdvancedCalls = append(f.getAdvancedCalls, instanceId)

	settings, ok := f.settings[instanceId]
	if !ok {
		return nil, errors.New("instance not found")
	}
	copy := *settings
	return &copy, nil
}

func (f *fakeInstanceService) UpdateAdvancedSettings(instanceId string, settings *instance_model.AdvancedSettings) error {
	call := advancedUpdateCall{instanceId: instanceId}
	if settings != nil {
		call.settings = *settings
	}
	f.updateAdvancedCalls = append(f.updateAdvancedCalls, call)
	return nil
}

func (f *fakeInstanceService) Info(instanceId string) (*instance_model.Instance, error) {
	f.infoCalls = append(f.infoCalls, instanceId)
	return nil, nil
}

func (f *fakeInstanceService) GetAll() ([]*instance_model.Instance, error) {
	f.getAllCalls++
	return nil, nil
}

func (f *fakeInstanceService) Create(data *instance_service.CreateStruct) (*instance_model.Instance, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) Connect(data *instance_service.ConnectStruct, instance *instance_model.Instance) (*instance_model.Instance, string, string, error) {
	return nil, "", "", errors.New("not expected in this test")
}

func (f *fakeInstanceService) Reconnect(instance *instance_model.Instance) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) Disconnect(instance *instance_model.Instance) (*instance_model.Instance, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) Logout(instance *instance_model.Instance) (*instance_model.Instance, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) Status(instance *instance_model.Instance) (*instance_service.StatusStruct, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) GetQr(instance *instance_model.Instance) (*instance_service.QrcodeStruct, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) Pair(data *instance_service.PairStruct, instance *instance_model.Instance) (*instance_service.PairReturnStruct, error) {
	return nil, errors.New("not expected in this test")
}

func (f *fakeInstanceService) Delete(id string) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) SetProxy(id string, proxyConfig *instance_service.ProxyConfig) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) SetProxyFromStruct(id string, data *instance_service.SetProxyStruct) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) RemoveProxy(id string) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) ForceReconnect(instanceId string, number string) error {
	return errors.New("not expected in this test")
}

func (f *fakeInstanceService) GetLogs(instanceId string, startDate, endDate time.Time, level string, limit int) ([]logger_wrapper.LogEntry, error) {
	return nil, errors.New("not expected in this test")
}
