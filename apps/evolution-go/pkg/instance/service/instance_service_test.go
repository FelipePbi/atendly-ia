package instance_service

import (
	"testing"

	"github.com/EvolutionAPI/evolution-go/pkg/config"
	instance_model "github.com/EvolutionAPI/evolution-go/pkg/instance/model"
	logger_wrapper "github.com/EvolutionAPI/evolution-go/pkg/logger"
	poll_service "github.com/EvolutionAPI/evolution-go/pkg/poll/service"
	whatsmeow_service "github.com/EvolutionAPI/evolution-go/pkg/whatsmeow/service"
	"go.mau.fi/whatsmeow"
)

func TestConnectPreservesExistingConfigurationOnEmptyPayload(t *testing.T) {
	repo := &fakeInstanceRepository{}
	whatsmeowSvc := &fakeWhatsmeowService{}
	svc := instances{
		instanceRepository: repo,
		config:             &config.Config{LogDirectory: t.TempDir(), LogMaxSize: 1, LogMaxBackups: 1, LogMaxAge: 1},
		killChannel:        map[string]chan bool{},
		clientPointer:      map[string]*whatsmeow.Client{},
		whatsmeowService:   whatsmeowSvc,
		loggerWrapper:      logger_wrapper.NewLoggerManager(&config.Config{LogDirectory: t.TempDir(), LogMaxSize: 1, LogMaxBackups: 1, LogMaxAge: 1}),
	}

	instance := &instance_model.Instance{
		Id:              "11111111-1111-4111-8111-111111111111",
		Name:            "test",
		Token:           "token",
		Events:          "MESSAGE,CONNECTION",
		Webhook:         "https://example.com/webhook",
		WebhookLocal:    "http://localhost:3000/webhook",
		RabbitmqEnable:  "enabled",
		WebSocketEnable: "disabled",
		NatsEnable:      "enabled",
	}

	updated, _, eventString, err := svc.Connect(&ConnectStruct{}, instance)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	if eventString != "MESSAGE,CONNECTION" {
		t.Fatalf("eventString = %q, want %q", eventString, "MESSAGE,CONNECTION")
	}

	if updated.Webhook != "https://example.com/webhook" {
		t.Fatalf("Webhook = %q", updated.Webhook)
	}
	if updated.WebhookLocal != "http://localhost:3000/webhook" {
		t.Fatalf("WebhookLocal = %q", updated.WebhookLocal)
	}
	if updated.RabbitmqEnable != "enabled" || updated.WebSocketEnable != "disabled" || updated.NatsEnable != "enabled" {
		t.Fatalf("queue flags changed: rabbit=%q websocket=%q nats=%q", updated.RabbitmqEnable, updated.WebSocketEnable, updated.NatsEnable)
	}
	if repo.updated == nil {
		t.Fatal("expected repository update")
	}
	if whatsmeowSvc.updatedSettingsFor != instance.Id {
		t.Fatalf("UpdateInstanceSettings called for %q, want %q", whatsmeowSvc.updatedSettingsFor, instance.Id)
	}
}

type fakeInstanceRepository struct {
	updated *instance_model.Instance
}

func (f *fakeInstanceRepository) Create(instance instance_model.Instance) (*instance_model.Instance, error) {
	return &instance, nil
}

func (f *fakeInstanceRepository) GetInstanceByID(instanceId string) (*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) GetConnectedInstanceByID(instanceId string) (*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) GetInstanceByToken(token string) (*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) GetInstanceByName(name string) (*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) Update(instance *instance_model.Instance) error {
	copy := *instance
	f.updated = &copy
	return nil
}

func (f *fakeInstanceRepository) UpdateConnected(userId string, status bool, disconnectReason string) error {
	return nil
}

func (f *fakeInstanceRepository) UpdateQrcode(userId string, qr string) error {
	return nil
}

func (f *fakeInstanceRepository) UpdateProxy(userId string, proxy string) error {
	return nil
}

func (f *fakeInstanceRepository) UpdateJid(userId string, jid string) error {
	return nil
}

func (f *fakeInstanceRepository) GetAllConnectedInstances() ([]*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) GetAllConnectedInstancesByClientName(clientName string) ([]*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) GetAll(clientName string) ([]*instance_model.Instance, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) Delete(instanceId string) error {
	return nil
}

func (f *fakeInstanceRepository) GetAdvancedSettings(instanceId string) (*instance_model.AdvancedSettings, error) {
	return nil, nil
}

func (f *fakeInstanceRepository) UpdateAdvancedSettings(instanceId string, settings *instance_model.AdvancedSettings) error {
	return nil
}

type fakeWhatsmeowService struct {
	updatedSettingsFor string
}

func (f *fakeWhatsmeowService) StartClient(clientData *whatsmeow_service.ClientData) {}

func (f *fakeWhatsmeowService) ConnectOnStartup(clientName string) {}

func (f *fakeWhatsmeowService) StartInstance(instanceId string) error {
	return nil
}

func (f *fakeWhatsmeowService) ReconnectClient(instanceId string) error {
	return nil
}

func (f *fakeWhatsmeowService) ClearInstanceCache(instanceId string, token string) error {
	return nil
}

func (f *fakeWhatsmeowService) CallWebhook(instance *instance_model.Instance, queueName string, jsonData []byte) {
}

func (f *fakeWhatsmeowService) SendToGlobalQueues(event string, jsonData []byte, userId string) {}

func (f *fakeWhatsmeowService) ForceUpdateJid(instanceId string, number string) error {
	return nil
}

func (f *fakeWhatsmeowService) UpdateInstanceSettings(instanceId string) error {
	f.updatedSettingsFor = instanceId
	return nil
}

func (f *fakeWhatsmeowService) UpdateInstanceAdvancedSettings(instanceId string) error {
	return nil
}

func (f *fakeWhatsmeowService) GetPollService() poll_service.PollService {
	return nil
}
