"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Edit3,
  Hash,
  MapPin,
  Phone,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/common/confirm-dialog";
import type { Device, FormOneRecord, FormOneRecordItem } from "@/lib/types";

type GardenOption = {
  code: string;
  label: string;
  deviceId: string;
};

type ServiceOption = {
  id: string;
  label: string;
};

type ModelOption = {
  id: string;
  label: string;
  services: ServiceOption[];
};

type ServiceLine = {
  id: string;
  serviceId: string;
  customServiceLabel: string;
  quantity: number;
};

type ModelLine = {
  id: string;
  modelId: string;
  services: ServiceLine[];
};

type Props = {
  canSelectGarden: boolean;
  devices: Device[];
  initialRecords: FormOneRecord[];
  permissions: {
    edit: boolean;
    delete: boolean;
  };
  todayLabel: string;
  todayValue: string;
};

const CUSTOM_SERVICE_ID = "custom-service";

const customServiceOption: ServiceOption = {
  id: CUSTOM_SERVICE_ID,
  label: "სხვა / ხელით ჩაწერა",
};

const printerServices = ["პრინტერის შეკეთება", "კატრიჯის დატენვა"];

const printerModels = [
  "HP LaserJet P1005",
  "HP LaserJet Pro P1102",
  "HP LaserJet 1010",
  "HP LaserJet 1018",
  "HP LaserJet 1020",
  "Canon i-SENSYS LBP251d",
  "Canon i-SENSYS LBP6000B",
  "Canon i-SENSYS LBP6020",
  "Canon i-SENSYS LBP6030",
  "HP LaserJet Pro M15",
  "Canon LASER SHOT LBP-1120",
  "HP LaserJet 1000",
  "Samsung ML-1615",
  "Samsung Xpress SL-M2070",
  "HP LaserJet Pro M1132",
  "Canon i-SENSYS MF3010",
  "Canon i-SENSYS MF4018",
  "HP LaserJet M1120",
  "Canon i-SENSYS MF4400",
  "Canon i-SENSYS MF4410",
  "HP LaserJet Pro MFP M130",
  "HP LaserJet Pro MFP M28",
  "HP LaserJet MFP M141",
  "HP Laser MFP 135",
  "HP LaserJet Pro MFP M125",
  "HP LaserJet Pro MFP M225",
  "HP LaserJet Pro MFP M26",
  "Canon i-SENSYS MF210",
  "Canon i-SENSYS MF211",
  "Canon i-SENSYS MF212",
  "Canon i-SENSYS MF231",
  "Pantum M6500",
  "HP LaserJet Pro M1212",
  "HP LaserJet Pro M1214",
  "Canon i-SENSYS MF428x",
  "HP LaserJet Pro MFP 4103",
  "HP LaserJet Pro MFP M428",
  "HP LaserJet Pro M1536",
  "HP LaserJet 3052",
  "HP LaserJet M1522",
  "Canon i-SENSYS MF4430",
  "Canon i-SENSYS MF4730",
  "HP LaserJet Ultra MFP M134",
  "HP Laser MFP 137",
  "Xerox WorkCentre 3025",
  "HP LaserJet Pro MFP M127",
  "HP LaserJet Pro MFP M227",
  "Canon i-SENSYS MF216",
  "Canon i-SENSYS MF237",
  "Canon i-SENSYS MF247",
  "Canon i-SENSYS MF264",
  "Canon imageRUNNER 1133",
  "Canon NP-6512",
  "Canon NP-7161",
  "Xerox Office Copier 5310",
  "Canon ImageRUNNER 2018",
  "Canon imageRUNNER 2318",
  "Canon imageRUNNER 2520",
  "HP Color LaserJet Pro M254dw",
  "HP Color LaserJet Pro CP1025",
  "Canon I-SENSYS LBP623",
  "Canon i-SENSYS MF641",
  "HP Color LaserJet Pro MFP M281",
  "HP Color LaserJet CM1312",
  "HP Color LaserJet Pro MFP M176n",
  "Epson L110",
  "Epson L312",
  "Epson L805",
  "Epson L1110",
  "Epson L1300",
  "Canon G1400",
  "Canon G1411",
  "Epson L222",
  "Epson L355",
  "Epson L362",
  "Epson L382",
  "Epson L3060",
  "Epson L3100",
  "Epson L3110",
  "Epson L3150",
  "Epson L3151",
  "Epson L3200",
  "Epson L3560",
  "Epson L4160",
  "Canon G2420",
  "Canon G3410",
  "Canon G3411",
  "Canon G6040",
  "HP InkTank 315",
  "HP DeskJet 2130",
  "Epson WorkForce Pro WF-M5799",
  "Canon i-sensys mf631 color",
  "Canon i-sensys MF655 color",
  "Lexmark C950 color",
];

const personalComputerServices = [
  `Windows 10/11 Enterprise/Professional ოპერაციული სისტემის ინსტალაცია
(ლიცენზიის აქტივაციის გარეშე),
მყარ დისკზე არსებული ინფორმაციის შენახვა და ახალ სისტემაში ჩატვირთვა`,
  "კომპიუტერის დიაგნოსტიკა",
  "კომპიუტერის გაწმენდა ვირუსებისგან",
  "სამუშაო მაგიდის გამართვა. (პერსონალური კომპიუტერის/ნოუთბუქის, პრინტერის, სკანერის სამუშაო მდგომარეობაში მოყვანა/ინსტალაცია, პრინტერის/სკანერის დაკავშირება კომპიუტერთან/ნოუთბუქთან. ინტერნეტთან  კავშირის გამართვა)",
  `Microsoft Office 2016/2019 (Word, Excel, Outlook, PowerPoint) (ლიცენზიის აქტივაციის
გარეშე)`,
  `პროგრამული პაკეტი (Adobe Reader, WinRaR, CapCut, Fonts (საჭირო ფონტების
ჩატვირთვა), Google Chrome, DJVu Reader, KMPlayer, VLC Player, Anydesk, )`,
  `PC/Laptop-თან პერიფერიული მოწყობილობის მიერთება, დრაივერების ინსტალაცია, ინტერნეტთან
მიერთება-კონფიგურაცია.`,
  `ქსელის დიაგნოსტიკა (კაბელების მოწესრიგება, მოთხოვნილი კაბელების მარკირება
ციფრებით ორივე მხარეს )`,
  "WiFi-ის და როუტერის კონფიგურაცია",
  "1 მეტრი LAN კაბელის  გაყვანა",
  "კედლის RJ45 არანაკლებ CAT5e როზეტის ინსტალაცია",
  `ადგილზე მისვლა.  სამუშაოები, რომლის შემთხვევაშიც აცილებელია ადგილზე მომსახურება
(WiFi-ის და როუტერის კონფიგურაცია,  სამუშაო მაგიდის გამართვა, 1 მეტრი LAN კაბელის  გაყვანა, ქსელის დიაგნოსტიკა, კედლის RJ45  არანაკლებ CAT5e როზეტის
ინსტალაცია)`,
];

const processorBlockServices = [
  "ოპერატიული მეხსნიერება (MEMORY 4 GB DDR3)",
  "ოპერატიული მეხსნიერება (MEMORY 8 GB DDR3)",
  "ოპერატიული მეხსნიერება (MEMORY 4 GB DDR4)",
  "ოპერატიული მეხსნიერება (MEMORY 8 GB DDR4)",
  "გამაგრილებლის თერმოპასტის შეცვლა",
  "DVD/R/RW შეცვლა",
  'მყარი დისკი (HDD/SATA/3,5", 7200rpm 500GB )',
  'მყარი დისკი (HDD/SATA/3,5", 7200rpm 1TB )',
  'მყარი დისკი (HDD/SATA/3,5", 7200rpm 4TB )',
  "SSD დისკი ( 256GB)",
  "SSD დისკი ( 512 GB)",
  "ქულერის შეცვლა",
  "კვების ბლოკის შეცვლა",
  "დედაპლატის შეკეთება",
];

const notebookServices = [
  "მყარი დისკი (500GB )",
  "მყარი დისკი (1TB )",
  "SSD დისკი ( 256GB)",
  "SSD დისკი ( 512 GB)",
  "კლავიატურის შეცვლა 109კ; 111კ",
  "თაჩპადის შეცვლა",
  "ლეპტოპის ბატარეა",
  "ეკრანის შეცვლა 11.6",
  "ეკრანის შეცვლა 13,3",
  "ეკრანის შეცვლა 15,6",
  "ეკრანის შეცვლა 17,3",
  "გამაგრილებლის თერმოპასტის შეცვლა",
  "ქულერის შეცვლა",
  "კვების ბლოკის შეკეთება",
  "კვების ბლოკის შეცვლა",
  "დედაპლატის შეკეთება",
  "კვების ბლოკის დამაკავშირებელი ბუდის შეკეთება",
  "ოპერატიული მეხსნიერება (MEMORY 4 GB DDR3)",
  "ოპერატიული მეხსნიერება (MEMORY 8 GB DDR3)",
  "ოპერატიული მეხსნიერება (MEMORY 4 GB DDR4)",
  "ოპერატიული მეხსნიერება (MEMORY 8 GB DDR4)",
];

const monitorServices = [
  "მაღალი ძაბვის კვების ბლოკის შეკეთება",
  "კვების ბლოკის შეკეთება",
  "VGA / DVI / HDMI კაბელის შეცვლა",
];

const projectorServices = [
  "ნათურის შეცვლა",
  "ელექტრონული დაზიანების შეკეთება",
  "ლინზისა და ოპტიკის გაწმენდა",
  "ფილტრის გაწმენდა/შეცვლა",
];

const modelServiceCatalog: { models: string[]; services: string[] }[] = [
  {
    models: ["პერსონალური კომპიუტერები და ლეპტოპები"],
    services: personalComputerServices,
  },
  {
    models: ["პროცესორული ბლოკები"],
    services: processorBlockServices,
  },
  {
    models: ["ნოუთბუქები"],
    services: notebookServices,
  },
  {
    models: ["მონიტორები"],
    services: monitorServices,
  },
  {
    models: ["პროექტორები"],
    services: projectorServices,
  },
  {
    models: printerModels,
    services: printerServices,
  },
];

const modelOptions = buildModelOptions(modelServiceCatalog);
const initialModelId = modelOptions[0]?.id ?? "";
const initialServiceId = getDefaultServiceId(initialModelId);

export function FormOneManager({
  canSelectGarden,
  devices,
  initialRecords,
  permissions,
  todayLabel,
  todayValue,
}: Props) {
  const gardenOptions = useMemo(() => buildGardenOptions(devices), [devices]);
  const [records, setRecords] = useState(initialRecords);
  const [gardenDeviceId, setGardenDeviceId] = useState(
    gardenOptions[0]?.deviceId ?? "",
  );
  const [phone, setPhone] = useState("");
  const [submittedDate, setSubmittedDate] = useState(todayValue);
  const [modelLines, setModelLines] = useState<ModelLine[]>(() =>
    createInitialModelLines(),
  );
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, confirmationDialog } = useConfirmDialog();

  const selectedGarden = gardenOptions.find(
    (garden) => garden.deviceId === gardenDeviceId,
  );
  const serviceCount = modelLines.reduce(
    (total, line) => total + line.services.length,
    0,
  );
  const totalQuantity = modelLines.reduce(
    (total, line) =>
      total +
      line.services.reduce(
        (lineTotal, service) => lineTotal + service.quantity,
        0,
      ),
    0,
  );
  const formDateLabel = formatDisplayDate(submittedDate) || todayLabel;

  async function saveFormOneRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = buildRecordItems(modelLines);
    if (!gardenDeviceId || !items.length) {
      setError("აირჩიეთ ბაღი და შეავსეთ მინიმუმ ერთი მომსახურება.");
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(
      editingRecordId ? `/api/form-one/${editingRecordId}` : "/api/form-one",
      {
        method: editingRecordId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: gardenDeviceId,
          gardenLabel: selectedGarden?.label ?? "",
          phone,
          submittedDate,
          items,
        }),
      },
    ).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError(
        editingRecordId
          ? "ფორმა ერთის განახლება ვერ მოხერხდა."
          : "ფორმა ერთის შენახვა ვერ მოხერხდა.",
      );
      return;
    }

    const data = (await response.json()) as { record: FormOneRecord };
    setRecords((current) =>
      editingRecordId
        ? current.map((record) =>
            record.id === data.record.id ? data.record : record,
          )
        : [data.record, ...current],
    );
    resetForm();
  }

  function resetForm() {
    setEditingRecordId(null);
    setGardenDeviceId(gardenOptions[0]?.deviceId ?? "");
    setPhone("");
    setSubmittedDate(todayValue);
    setModelLines(createInitialModelLines());
    setError("");
  }

  function startEdit(record: FormOneRecord) {
    if (!permissions.edit) {
      return;
    }

    setEditingRecordId(record.id);
    setGardenDeviceId(resolveRecordDeviceId(record, gardenOptions));
    setPhone(record.phone ?? "");
    setSubmittedDate(record.submittedDate);
    setModelLines(createModelLinesFromRecord(record));
    setError("");
  }

  async function removeRecord(recordId: string) {
    if (!permissions.delete) {
      return;
    }

    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch(`/api/form-one/${recordId}`, {
      method: "DELETE",
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("ფორმა ერთის წაშლა ვერ მოხერხდა.");
      return;
    }

    setRecords((current) => current.filter((record) => record.id !== recordId));
    if (editingRecordId === recordId) {
      resetForm();
    }
  }

  function addModelLine() {
    setModelLines((current) => [
      ...current,
      {
        id: makeClientId("model-line"),
        modelId: initialModelId,
        services: [
          {
            id: makeClientId("service-line"),
            serviceId: initialServiceId,
            customServiceLabel: "",
            quantity: 1,
          },
        ],
      },
    ]);
  }

  async function removeModelLine(lineId: string) {
    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setModelLines((current) =>
      current.length === 1
        ? current
        : current.filter((line) => line.id !== lineId),
    );
  }

  function updateModel(lineId: string, modelId: string) {
    const firstServiceId = getDefaultServiceId(modelId);
    setModelLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              modelId,
              services: [
                {
                  id: line.services[0]?.id ?? makeClientId("service-line"),
                  serviceId: firstServiceId,
                  customServiceLabel: "",
                  quantity: line.services[0]?.quantity ?? 1,
                },
              ],
            }
          : line,
      ),
    );
  }

  function addServiceLine(lineId: string) {
    setModelLines((current) =>
      current.map((line) => {
        if (line.id !== lineId) {
          return line;
        }

        const nextServiceId = getNextAvailableServiceId(line);

        return {
          ...line,
          services: [
            ...line.services,
            {
              id: makeClientId("service-line"),
              serviceId: nextServiceId,
              customServiceLabel: "",
              quantity: 1,
            },
          ],
        };
      }),
    );
  }

  async function removeServiceLine(lineId: string, serviceLineId: string) {
    const confirmed = await confirm();
    if (!confirmed) {
      return;
    }

    setModelLines((current) =>
      current.map((line) => {
        if (line.id !== lineId || line.services.length === 1) {
          return line;
        }

        return {
          ...line,
          services: line.services.filter(
            (service) => service.id !== serviceLineId,
          ),
        };
      }),
    );
  }

  function updateService(
    lineId: string,
    serviceLineId: string,
    serviceId: string,
  ) {
    setModelLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              services: line.services.map((service) =>
                service.id === serviceLineId
                  ? {
                      ...service,
                      serviceId,
                      customServiceLabel:
                        serviceId === CUSTOM_SERVICE_ID
                          ? service.customServiceLabel
                          : "",
                    }
                  : service,
              ),
            }
          : line,
      ),
    );
  }

  function updateCustomService(
    lineId: string,
    serviceLineId: string,
    customServiceLabel: string,
  ) {
    setModelLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              services: line.services.map((service) =>
                service.id === serviceLineId
                  ? {
                      ...service,
                      serviceId: customServiceLabel.trim()
                        ? CUSTOM_SERVICE_ID
                        : service.serviceId,
                      customServiceLabel,
                    }
                  : service,
              ),
            }
          : line,
      ),
    );
  }

  function updateQuantity(
    lineId: string,
    serviceLineId: string,
    quantity: number,
  ) {
    setModelLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              services: line.services.map((service) =>
                service.id === serviceLineId
                  ? { ...service, quantity: Math.max(1, quantity || 1) }
                  : service,
              ),
            }
          : line,
      ),
    );
  }

  return (
    <div className="form-one-page">
      {confirmationDialog}
      <section className="page-header">
        <div>
          <p className="eyebrow">ფორმაერთი</p>
          <h1>ფორმა ერთი</h1>
        </div>
        <div className="metric-strip">
          <div className="metric">
            <ClipboardList size={18} />
            <span>{serviceCount}</span>
            <small>მომსახურება</small>
          </div>
          <div className="metric">
            <Hash size={18} />
            <span>{totalQuantity}</span>
            <small>რაოდენობა</small>
          </div>
          <div className="metric">
            <CalendarDays size={18} />
            <span>{todayLabel}</span>
            <small>თარიღი</small>
          </div>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      <form className="surface form-one-surface" onSubmit={saveFormOneRecord}>
        <div className="form-one-fields">
          <label>
            <span>ბაღი</span>
            <div className="field-with-icon">
              <MapPin size={17} />
              <select
                value={gardenDeviceId}
                onChange={(event) => setGardenDeviceId(event.target.value)}
                disabled={!canSelectGarden || !gardenOptions.length}
              >
                {gardenOptions.length ? (
                  gardenOptions.map((garden) => (
                    <option key={garden.code} value={garden.deviceId}>
                      {garden.label}
                    </option>
                  ))
                ) : (
                  <option value="">ბაღი ვერ მოიძებნა</option>
                )}
              </select>
            </div>
          </label>
          <label>
            <span>ტელეფონის ნომერი</span>
            <div className="field-with-icon">
              <Phone size={17} />
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
              />
            </div>
          </label>
          <label>
            <span>თარიღი</span>
            <div className="field-with-icon">
              <CalendarDays size={17} />
              <input value={formDateLabel} readOnly />
            </div>
          </label>
        </div>

        <div className="form-one-meta">
          <span>{selectedGarden?.label ?? "ბაღი ვერ მოიძებნა"}</span>
          <span>{phone || "ტელეფონი არ არის მითითებული"}</span>
          <span>{formDateLabel}</span>
        </div>

        <div className="form-one-table-wrap">
          <table className="form-one-table">
            <thead>
              <tr>
                <th>№</th>
                <th>მოდელი</th>
                <th>მომსახურება</th>
                <th>რაოდ.</th>
              </tr>
            </thead>
            {modelLines.map((line) => (
              <ModelLineRows
                key={line.id}
                line={line}
                lineCount={modelLines.length}
                startNumber={getLineStartNumber(modelLines, line.id)}
                onAddService={() => addServiceLine(line.id)}
                onRemoveModel={() => removeModelLine(line.id)}
                onUpdateModel={(modelId) => updateModel(line.id, modelId)}
                onRemoveService={(serviceLineId) =>
                  removeServiceLine(line.id, serviceLineId)
                }
                onUpdateService={(serviceLineId, serviceId) =>
                  updateService(line.id, serviceLineId, serviceId)
                }
                onUpdateCustomService={(serviceLineId, customServiceLabel) =>
                  updateCustomService(
                    line.id,
                    serviceLineId,
                    customServiceLabel,
                  )
                }
                onUpdateQuantity={(serviceLineId, quantity) =>
                  updateQuantity(line.id, serviceLineId, quantity)
                }
              />
            ))}
          </table>
        </div>

        <button
          className="ghost-button form-one-add-model"
          type="button"
          onClick={addModelLine}
        >
          <Plus size={18} />
          <span>მომსახურების დამატება</span>
        </button>

        <div className="form-one-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={18} />
            <span>
              {saving
                ? "ინახება..."
                : editingRecordId
                  ? "ფორმა ერთის განახლება"
                  : "ფორმა ერთის დადასტურება"}
            </span>
          </button>
          {editingRecordId ? (
            <button className="ghost-button" type="button" onClick={resetForm}>
              <X size={17} />
              <span>გაუქმება</span>
            </button>
          ) : null}
        </div>
      </form>

      <section className="surface form-one-history">
        <div className="section-title">
          <h2>შევსებული ფორმები</h2>
          <ClipboardList size={20} />
        </div>
        {records.length ? (
          <div className="form-one-record-list">
            {records.map((record) => (
              <FormOneRecordCard
                key={record.id}
                record={record}
                permissions={permissions}
                onEdit={() => startEdit(record)}
                onDelete={() => removeRecord(record.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">ჩანაწერები არ არის.</div>
        )}
      </section>
    </div>
  );
}

function ModelLineRows({
  line,
  lineCount,
  startNumber,
  onAddService,
  onRemoveModel,
  onUpdateModel,
  onRemoveService,
  onUpdateService,
  onUpdateCustomService,
  onUpdateQuantity,
}: {
  line: ModelLine;
  lineCount: number;
  startNumber: number;
  onAddService: () => void;
  onRemoveModel: () => void;
  onUpdateModel: (modelId: string) => void;
  onRemoveService: (serviceLineId: string) => void;
  onUpdateService: (serviceLineId: string, serviceId: string) => void;
  onUpdateCustomService: (
    serviceLineId: string,
    customServiceLabel: string,
  ) => void;
  onUpdateQuantity: (serviceLineId: string, quantity: number) => void;
}) {
  const model = getModelOption(line.modelId);

  return (
    <tbody className="form-one-model-group">
      {line.services.map((service, serviceIndex) => {
        const availableServices = getSelectableServices(
          line,
          service.serviceId,
        );
        const hasCustomService = Boolean(service.customServiceLabel.trim());

        return (
          <tr key={service.id}>
            <td className="form-one-number-cell">
              {startNumber + serviceIndex}
            </td>
            {serviceIndex === 0 ? (
              <td
                className="form-one-model-cell"
                rowSpan={line.services.length}
              >
                <select
                  value={line.modelId}
                  onChange={(event) => onUpdateModel(event.target.value)}
                >
                  {modelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="form-one-row-actions">
                  <button
                    className="icon-button danger"
                    type="button"
                    aria-label="მოდელის წაშლა"
                    title="მოდელის წაშლა"
                    onClick={onRemoveModel}
                    disabled={lineCount === 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            ) : null}
            <td className="form-one-service-cell">
              <div className="form-one-service-inputs">
                {hasCustomService ? null : (
                  <select
                    value={service.serviceId}
                    onChange={(event) =>
                      onUpdateService(service.id, event.target.value)
                    }
                  >
                    {availableServices.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={service.customServiceLabel}
                  onChange={(event) =>
                    onUpdateCustomService(service.id, event.target.value)
                  }
                  placeholder="ან ჩაწერეთ მომსახურება"
                />
              </div>
              <div className="form-one-service-actions">
                {serviceIndex === line.services.length - 1 ? (
                  <button
                    className="ghost-button form-one-add-service"
                    type="button"
                    onClick={onAddService}
                  >
                    <Plus size={16} />
                    <span>დამატება</span>
                  </button>
                ) : null}
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label="მომსახურების წაშლა"
                  title="მომსახურების წაშლა"
                  onClick={() => onRemoveService(service.id)}
                  disabled={line.services.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </td>
            <td className="form-one-quantity-cell">
              <input
                type="number"
                min={1}
                value={service.quantity}
                onChange={(event) =>
                  onUpdateQuantity(service.id, Number(event.target.value))
                }
                aria-label={`${model?.label ?? "მოდელი"} რაოდენობა`}
              />
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function FormOneRecordCard({
  record,
  permissions,
  onEdit,
  onDelete,
}: {
  record: FormOneRecord;
  permissions: Props["permissions"];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalQuantity = record.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  return (
    <article className="form-one-record">
      <div className="form-one-record-head">
        <div>
          <strong>{record.gardenLabel}</strong>
          <div className="form-one-record-meta">
            <span>{formatDisplayDate(record.submittedDate)}</span>
            {record.phone ? <span>{record.phone}</span> : null}
            <span>{record.items.length} მომსახურება</span>
            <span>{totalQuantity} რაოდ.</span>
          </div>
        </div>
        <div className="row-actions">
          {permissions.edit ? (
            <button
              className="icon-button"
              type="button"
              aria-label="რედაქტირება"
              title="რედაქტირება"
              onClick={onEdit}
            >
              <Edit3 size={17} />
            </button>
          ) : null}
          {permissions.delete ? (
            <button
              className="icon-button danger"
              type="button"
              aria-label="წაშლა"
              title="წაშლა"
              onClick={onDelete}
            >
              <Trash2 size={17} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="form-one-record-items">
        <div className="form-one-record-item head">
          <span>№</span>
          <span>მოდელი</span>
          <span>მომსახურება</span>
          <span>რაოდ.</span>
        </div>
        {record.items.map((item, index) => (
          <div
            className="form-one-record-item"
            key={`${record.id}-${index}-${item.serviceLabel}`}
          >
            <span>{index + 1}</span>
            <strong>{item.modelLabel}</strong>
            <span>{item.serviceLabel}</span>
            <span>{item.quantity}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function createInitialModelLines(): ModelLine[] {
  return [
    {
      id: makeClientId("model-line"),
      modelId: initialModelId,
      services: [
        {
          id: makeClientId("service-line"),
          serviceId: initialServiceId,
          customServiceLabel: "",
          quantity: 1,
        },
      ],
    },
  ];
}

function buildRecordItems(lines: ModelLine[]): FormOneRecordItem[] {
  return lines
    .flatMap((line) => {
      const model = getModelOption(line.modelId);
      return line.services.map((service) => {
        const customServiceLabel = service.customServiceLabel.trim();
        const catalogService =
          service.serviceId === CUSTOM_SERVICE_ID
            ? undefined
            : getServiceOption(line.modelId, service.serviceId);
        const serviceLabel = customServiceLabel || catalogService?.label || "";

        return {
          modelId: line.modelId,
          modelLabel: model?.label ?? "",
          serviceId: customServiceLabel ? CUSTOM_SERVICE_ID : service.serviceId,
          serviceLabel,
          customServiceLabel: customServiceLabel || undefined,
          quantity: Math.max(1, service.quantity || 1),
        };
      });
    })
    .filter((item) => item.modelLabel && item.serviceLabel);
}

function createModelLinesFromRecord(record: FormOneRecord): ModelLine[] {
  const linesByModel = new Map<string, ModelLine>();

  record.items.forEach((item) => {
    const modelId = resolveModelId(item);
    let line = linesByModel.get(modelId);
    if (!line) {
      line = {
        id: makeClientId("model-line"),
        modelId,
        services: [],
      };
      linesByModel.set(modelId, line);
    }
    const serviceDraft = resolveServiceLine(modelId, item);

    line.services.push({
      id: makeClientId("service-line"),
      serviceId: serviceDraft.serviceId,
      customServiceLabel: serviceDraft.customServiceLabel,
      quantity: Math.max(1, item.quantity || 1),
    });
  });

  const lines = [...linesByModel.values()].filter(
    (line) => line.services.length,
  );
  return lines.length ? lines : createInitialModelLines();
}

function resolveModelId(item: FormOneRecordItem) {
  return (
    modelOptions.find((option) => option.label === item.modelLabel)?.id ??
    getModelOption(item.modelId)?.id ??
    initialModelId
  );
}

function resolveServiceLine(modelId: string, item: FormOneRecordItem) {
  const customLabel = item.customServiceLabel?.trim();
  if (customLabel) {
    return { serviceId: CUSTOM_SERVICE_ID, customServiceLabel: customLabel };
  }

  const model = getModelOption(modelId);
  const serviceByLabel = model?.services.find(
    (service) => service.label === item.serviceLabel,
  );
  if (serviceByLabel) {
    return { serviceId: serviceByLabel.id, customServiceLabel: "" };
  }

  const serviceById = model?.services.find(
    (service) => service.id === item.serviceId,
  );
  if (serviceById) {
    return { serviceId: serviceById.id, customServiceLabel: "" };
  }

  return {
    serviceId: CUSTOM_SERVICE_ID,
    customServiceLabel: item.serviceLabel,
  };
}

function resolveRecordDeviceId(
  record: FormOneRecord,
  gardenOptions: GardenOption[],
) {
  return (
    gardenOptions.find((garden) => garden.deviceId === record.deviceId)
      ?.deviceId ??
    gardenOptions.find(
      (garden) => garden.code === normalizeGardenCode(record.deviceGroupCode),
    )?.deviceId ??
    gardenOptions[0]?.deviceId ??
    ""
  );
}

function getModelOption(modelId: string) {
  return modelOptions.find((option) => option.id === modelId);
}

function getServiceOption(modelId: string, serviceId: string) {
  if (serviceId === CUSTOM_SERVICE_ID) {
    return customServiceOption;
  }

  return getModelOption(modelId)?.services.find(
    (service) => service.id === serviceId,
  );
}

function buildModelOptions(
  catalog: { models: string[]; services: string[] }[],
): ModelOption[] {
  return catalog.flatMap((group, groupIndex) =>
    group.models.map((model, modelIndex) => ({
      id: `catalog-model-${groupIndex + 1}-${modelIndex + 1}`,
      label: model,
      services: group.services.map((service, serviceIndex) => ({
        id: `catalog-service-${groupIndex + 1}-${serviceIndex + 1}`,
        label: service,
      })),
    })),
  );
}

function getDefaultServiceId(modelId: string) {
  return getModelOption(modelId)?.services[0]?.id ?? CUSTOM_SERVICE_ID;
}

function getNextAvailableServiceId(line: ModelLine) {
  const selectedServiceIds = new Set(
    line.services
      .map((service) => service.serviceId)
      .filter((serviceId) => serviceId !== CUSTOM_SERVICE_ID),
  );

  return (
    getModelOption(line.modelId)?.services.find(
      (service) => !selectedServiceIds.has(service.id),
    )?.id ?? CUSTOM_SERVICE_ID
  );
}

function getSelectableServices(line: ModelLine, currentServiceId: string) {
  const selectedServiceIds = new Set(
    line.services
      .map((service) => service.serviceId)
      .filter(
        (serviceId) =>
          serviceId !== currentServiceId && serviceId !== CUSTOM_SERVICE_ID,
      ),
  );

  const catalogServices =
    getModelOption(line.modelId)?.services.filter(
      (service) => !selectedServiceIds.has(service.id),
    ) ?? [];

  return [...catalogServices, customServiceOption];
}

function getLineStartNumber(lines: ModelLine[], lineId: string) {
  const index = lines.findIndex((line) => line.id === lineId);
  return lines
    .slice(0, Math.max(0, index))
    .reduce((total, line) => total + line.services.length, 1);
}

function buildGardenOptions(devices: Device[]): GardenOption[] {
  const options = new Map<string, GardenOption>();

  devices.forEach((device) => {
    const code = getGardenCode(device);
    if (!code || options.has(code)) {
      return;
    }

    options.set(code, {
      code,
      label: getGardenDisplayName(device),
      deviceId: device.id,
    });
  });

  return [...options.values()];
}

function getGardenDisplayName(device: Device) {
  return getGardenCode(device) || device.name;
}

function getGardenCode(device: Pick<Device, "code" | "name">) {
  const name = String(device.name || "").trim();
  return normalizeGardenCode(name) || normalizeGardenCode(device.code);
}

function normalizeGardenCode(value?: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const firstPart = trimmed.split("-")[0]?.trim();
  if (firstPart && /^\d+$/.test(firstPart)) {
    return firstPart;
  }

  return trimmed.match(/\d+/)?.[0] || firstPart || trimmed;
}

function formatDisplayDate(value: string) {
  const normalized = value.trim();
  const dateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return normalized;
  }

  return `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`;
}

function makeClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
