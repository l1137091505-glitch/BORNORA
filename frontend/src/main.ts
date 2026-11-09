import SunCalc from "suncalc";
import { AbiCoder, BrowserProvider, Contract, getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
};

type WalletDetail = {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193Provider;
};

type Place = { name: string; country: string; admin1?: string; latitude: number; longitude: number; timezone?: string };
type PublicEvent = { text: string; year: number; pages?: Array<{ title: string; content_urls?: { desktop?: { page?: string } } }> };
type Report = {
  date: string;
  time: string;
  place: Place | null;
  weekday: string;
  high: number | null;
  low: number | null;
  weatherCode: number | null;
  moon: string;
  event: PublicEvent | null;
  daysAlive: number;
  zodiac: string;
  sources: string[];
};

declare global {
  interface Window { ethereum?: Eip1193Provider }
}

const BOT_CHAIN = {
  chainId: "0x2a5",
  chainName: "BOT Chain Mainnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: ["https://rpc.botchain.ai"],
  blockExplorerUrls: ["https://scan.botchain.ai"]
};

const ABI = [
  "function keep(bytes32 fingerprint,uint16 publicYear) payable returns (uint256)",
  "function gift(address recipient,bytes32 fingerprint,string note) payable returns (uint256)",
  "function KEEP_FEE() view returns (uint256)",
  "function GIFT_FEE() view returns (uint256)",
  "event RecordKept(uint256 indexed recordId,address indexed owner,bytes32 indexed fingerprint,uint16 publicYear)",
  "event RecordGifted(uint256 indexed recordId,address indexed sender,address indexed recipient,bytes32 fingerprint,string note)"
];

const contractAddress = (import.meta.env.VITE_BORNORA_ADDRESS || "").trim();
const wallets = new Map<string, WalletDetail>();
let selectedWallet: WalletDetail | null = null;
let account = "";
let selectedPlace: Place | null = null;
let currentReport: Report | null = null;
let currentSalt = "";
let currentFingerprint = "";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = <T extends HTMLElement>(selector: string) => Array.from(document.querySelectorAll<T>(selector));
const setText = (selector: string, value: string) => { $(selector).textContent = value; };

function initializeDesignAssets() {
  requestAnimationFrame(() => {
    const modules = ["/assets/system.js", "/assets/motion/motion.js", "/assets/layout/layout.js"];
    modules.forEach((modulePath) => void import(/* @vite-ignore */ modulePath).catch(() => undefined));
  });
}

function collectWallets() {
  window.addEventListener("eip6963:announceProvider", ((event: CustomEvent<WalletDetail>) => {
    wallets.set(event.detail.info.uuid, event.detail);
    renderWalletOptions();
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const injected = window.ethereum;
  const providers = injected?.providers?.length ? injected.providers : injected ? [injected] : [];
  providers.forEach((provider, index) => {
    const name = provider.isRabby ? "Rabby" : provider.isCoinbaseWallet ? "Coinbase Wallet" : provider.isMetaMask ? "MetaMask" : `Browser wallet ${index + 1}`;
    const key = `legacy-${name}-${index}`;
    if (![...wallets.values()].some((item) => item.provider === provider)) {
      wallets.set(key, { info: { uuid: key, name, rdns: "injected.wallet" }, provider });
    }
  });
  renderWalletOptions();
}

function renderWalletOptions() {
  const holder = $("#walletOptions");
  holder.replaceChildren();
  const unique = [...wallets.values()].filter((item, index, items) => items.findIndex((other) => other.provider === item.provider) === index);
  if (!unique.length) {
    const empty = document.createElement("div");
    empty.className = "wallet-option";
    empty.innerHTML = "<span><strong>No browser wallet detected</strong><small>Install a wallet extension, or use the mobile link below.</small></span>";
    holder.append(empty);
    return;
  }
  unique.forEach((wallet) => {
    const button = document.createElement("button");
    button.className = "wallet-option";
    button.type = "button";
    const icon = wallet.info.icon ? `<img src="${escapeAttribute(wallet.info.icon)}" alt="" />` : `<span class="brand-orbit" aria-hidden="true"></span>`;
    button.innerHTML = `${icon}<span><strong>${escapeHtml(wallet.info.name)}</strong><small>${escapeHtml(wallet.info.rdns || "EIP-1193 provider")}</small></span>`;
    button.addEventListener("click", () => void connectWallet(wallet));
    holder.append(button);
  });
}

async function connectWallet(wallet: WalletDetail) {
  setWalletMessage("Requesting account access…");
  try {
    const accounts = await wallet.provider.request({ method: "eth_requestAccounts" }) as string[];
    if (!accounts?.[0]) throw new Error("The wallet returned no account.");
    selectedWallet = wallet;
    account = getAddress(accounts[0]);
    await ensureBotChain(wallet.provider);
    attachWalletListeners(wallet.provider);
    updateWalletUi();
    ($("#walletDialog") as HTMLDialogElement).close();
    setWalletMessage(`Connected ${shortAddress(account)} on BOT Chain.`, "success");
  } catch (error) {
    setWalletMessage(walletError(error), "error");
  }
}

async function ensureBotChain(provider: Eip1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (current?.toLowerCase() === BOT_CHAIN.chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BOT_CHAIN.chainId }] });
  } catch (error) {
    const code = Number((error as { code?: number }).code);
    if (code !== 4902 && code !== -32603) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [BOT_CHAIN] });
  }
}

function attachWalletListeners(provider: Eip1193Provider) {
  provider.on?.("accountsChanged", (...args: unknown[]) => {
    const accounts = args[0] as string[];
    account = accounts?.[0] ? getAddress(accounts[0]) : "";
    updateWalletUi();
  });
  provider.on?.("chainChanged", (...args: unknown[]) => {
    const chainId = String(args[0] || "");
    setWalletMessage(chainId.toLowerCase() === BOT_CHAIN.chainId ? "BOT Chain connected." : "Switch to BOT Chain to write a record.", chainId.toLowerCase() === BOT_CHAIN.chainId ? "success" : "error");
  });
}

function updateWalletUi() {
  const button = $("#walletButton");
  button.classList.toggle("is-connected", Boolean(account));
  setText("#walletLabel", account ? shortAddress(account) : "Connect wallet");
  setText("#chainStatus", account ? shortAddress(account).toUpperCase() : "WALLET OFFLINE");
  updateActionState();
}

function openWalletDialog() {
  collectWallets();
  const link = $("#mobileWalletLink") as HTMLAnchorElement;
  link.href = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
  ($("#walletDialog") as HTMLDialogElement).showModal();
}

async function searchPlaces() {
  const query = ($("#placeQuery") as HTMLInputElement).value.trim();
  const holder = $("#placeResults");
  if (query.length < 2) { holder.textContent = "Type at least two characters."; return; }
  holder.textContent = "Searching public geocoding data…";
  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    if (!response.ok) throw new Error("Place lookup failed.");
    const data = await response.json() as { results?: Place[] };
    holder.replaceChildren();
    if (!data.results?.length) { holder.textContent = "No matching place found."; return; }
    data.results.forEach((place) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
      button.addEventListener("click", () => {
        selectedPlace = place;
        $$("#placeResults button").forEach((item) => item.classList.toggle("is-selected", item === button));
        ($("#placeQuery") as HTMLInputElement).value = button.textContent || place.name;
      });
      holder.append(button);
    });
  } catch (error) {
    holder.textContent = humanError(error);
  }
}

async function rebuild(event: SubmitEvent) {
  event.preventDefault();
  const date = ($("#birthDate") as HTMLInputElement).value;
  const time = ($("#birthTime") as HTMLInputElement).value;
  if (!date) return;
  setText("#reportState", "FETCHING");
  $("#rebuildForm").querySelector<HTMLButtonElement>("button[type=submit]")!.disabled = true;
  const day = new Date(`${date}T${time || "12:00"}:00`);
  try {
    const [weather, eventItem] = await Promise.all([
      selectedPlace ? fetchWeather(date, selectedPlace) : Promise.resolve({ high: null, low: null, code: null }),
      fetchOnThisDay(day)
    ]);
    const illumination = SunCalc.getMoonIllumination(day).phase;
    const sources = ["SunCalc"];
    if (selectedPlace && (weather.high !== null || weather.low !== null)) sources.push("Open-Meteo");
    if (eventItem) sources.push("Wikimedia");
    currentReport = {
      date, time, place: selectedPlace,
      weekday: new Intl.DateTimeFormat("en", { weekday: "long" }).format(day),
      high: weather.high, low: weather.low, weatherCode: weather.code,
      moon: moonPhaseName(illumination), event: eventItem,
      daysAlive: Math.max(0, Math.floor((Date.now() - day.getTime()) / 86400000)),
      zodiac: zodiacFor(day.getUTCMonth() + 1, day.getUTCDate()), sources
    };
    currentSalt = randomHex(32);
    currentFingerprint = fingerprintReport(currentReport, currentSalt);
    renderReport(currentReport);
    updateActionState();
    setText("#reportState", "COMPLETE");
    $("#report").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  } catch (error) {
    setText("#reportState", "PARTIAL");
    setWalletMessage(humanError(error), "error");
  } finally {
    $("#rebuildForm").querySelector<HTMLButtonElement>("button[type=submit]")!.disabled = false;
  }
}

async function fetchWeather(date: string, place: Place) {
  const params = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude), start_date: date, end_date: date,
    daily: "temperature_2m_max,temperature_2m_min,weather_code", timezone: "auto"
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!response.ok) return { high: null, low: null, code: null };
  const data = await response.json() as { daily?: { temperature_2m_max?: Array<number | null>; temperature_2m_min?: Array<number | null>; weather_code?: Array<number | null> } };
  return { high: data.daily?.temperature_2m_max?.[0] ?? null, low: data.daily?.temperature_2m_min?.[0] ?? null, code: data.daily?.weather_code?.[0] ?? null };
}

async function fetchOnThisDay(day: Date): Promise<PublicEvent | null> {
  const month = String(day.getUTCMonth() + 1).padStart(2, "0");
  const date = String(day.getUTCDate()).padStart(2, "0");
  try {
    const response = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${date}`);
    if (!response.ok) return null;
    const data = await response.json() as { events?: PublicEvent[] };
    if (!data.events?.length) return null;
    const targetYear = day.getUTCFullYear();
    return [...data.events].sort((a, b) => Math.abs(a.year - targetYear) - Math.abs(b.year - targetYear))[0];
  } catch { return null; }
}

function renderReport(report: Report) {
  $("#emptyReport").hidden = true;
  $("#reportContent").hidden = false;
  setText("#reportDate", report.date.replaceAll("-", " / "));
  setText("#reportWeekday", report.weekday.toUpperCase());
  setText("#reportHeadline", report.place ? `${report.place.name}, on your date.` : "The date, on record.");
  setText("#reportPlace", report.place ? [report.place.name, report.place.country].join(" / ").toUpperCase() : "PLACE NOT PROVIDED");
  setText("#weatherHigh", report.high === null ? "N/A" : `${report.high.toFixed(1)}°`);
  setText("#weatherLow", report.low === null ? "N/A" : `${report.low.toFixed(1)}°`);
  setText("#moonPhase", report.moon);
  setText("#eventTitle", report.event ? `${report.event.year}: ${report.event.text.split(".")[0]}.` : "No public event returned for this date.");
  setText("#eventText", report.event?.text || "The history service did not return an event. The report leaves this field empty rather than inventing one.");
  const link = $("#eventLink") as HTMLAnchorElement;
  const url = report.event?.pages?.[0]?.content_urls?.desktop?.page;
  link.hidden = !url; link.href = url || "#";
  setText("#daysAlive", report.daysAlive.toLocaleString());
  setText("#zodiacName", report.zodiac);
  setText("#sourceCount", String(report.sources.length));
  setText("#fingerprintValue", currentFingerprint);
  ($("#downloadButton") as HTMLButtonElement).disabled = false;
  ($("#downloadBackup") as HTMLButtonElement).disabled = false;
}

function downloadReport(privateBackup = false) {
  if (!currentReport) return;
  const payload = privateBackup
    ? { version: 1, warning: "Keep this file private. It contains the details and salt needed to verify your fingerprint.", report: currentReport, salt: currentSalt, fingerprint: currentFingerprint }
    : { version: 1, report: currentReport, fingerprint: currentFingerprint, rawDetailsExcludedFromChain: true };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = privateBackup ? `bornora-private-backup-${currentReport.date}.json` : `bornora-report-${currentReport.date}.json`;
  anchor.click(); URL.revokeObjectURL(url);
}

async function writeRecord(mode: "keep" | "gift") {
  if (!selectedWallet || !account || !currentReport || !currentFingerprint) { openWalletDialog(); return; }
  if (!contractAddress || !isAddress(contractAddress)) {
    setWalletMessage("Contract not configured. Add VITE_BORNORA_ADDRESS in Vercel, then redeploy.", "error"); return;
  }
  try {
    await ensureBotChain(selectedWallet.provider);
    const browserProvider = new BrowserProvider(selectedWallet.provider);
    const signer = await browserProvider.getSigner(account);
    const contract = new Contract(contractAddress, ABI, signer);
    setWalletMessage("Confirm the BOT Chain transaction in your wallet…");
    let transaction;
    if (mode === "keep") {
      const yearRaw = Number((pluck<HTMLInputElement>("#publicYear").value || "0"));
      const publicYear = Number.isInteger(yearRaw) && yearRaw >= 0 && yearRaw <= 9999 ? yearRaw : 0;
      const fee = await contract.KEEP_FEE();
      transaction = await contract.keep(currentFingerprint, publicYear, { value: fee });
    } else {
      const recipient = pluck<HTMLInputElement>("#recipient").value.trim();
      const note = pluck<HTMLTextAreaElement>("#giftNote").value.trim();
      if (!isAddress(recipient) || getAddress(recipient) === account) throw new Error("Enter a different valid recipient address.");
      if (new TextEncoder().encode(note).length > 140) throw new Error("The public note exceeds 140 bytes.");
      const fee = await contract.GIFT_FEE();
      transaction = await contract.gift(getAddress(recipient), currentFingerprint, note, { value: fee });
    }
    setWalletMessage(`Transaction submitted: ${shortAddress(transaction.hash)}. Waiting for confirmation…`);
    const receipt = await transaction.wait();
    if (receipt?.status !== 1) throw new Error("The transaction was not confirmed.");
    setWalletMessage(`Confirmed in block ${receipt.blockNumber}. Download and keep your private backup.`, "success");
  } catch (error) { setWalletMessage(walletError(error), "error"); }
}

function updateActionState() {
  const enabled = Boolean(account && currentReport && currentFingerprint);
  ($("#keepButton") as HTMLButtonElement).disabled = !enabled;
  ($("#giftButton") as HTMLButtonElement).disabled = !enabled;
}

function setWalletMessage(message: string, kind?: "success" | "error") {
  const node = $("#txMessage");
  node.textContent = message;
  node.classList.toggle("is-success", kind === "success");
  node.classList.toggle("is-error", kind === "error");
}

function fingerprintReport(report: Report, salt: string) {
  const normalized = JSON.stringify({ date: report.date, time: report.time, place: report.place ? [report.place.name, report.place.country, report.place.latitude, report.place.longitude] : null, salt });
  return keccak256(toUtf8Bytes(normalized));
}

function randomHex(bytes: number) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return `0x${[...values].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function moonPhaseName(phase: number) {
  if (phase < .03 || phase > .97) return "New moon";
  if (phase < .22) return "Waxing crescent";
  if (phase < .28) return "First quarter";
  if (phase < .47) return "Waxing gibbous";
  if (phase < .53) return "Full moon";
  if (phase < .72) return "Waning gibbous";
  if (phase < .78) return "Last quarter";
  return "Waning crescent";
}

function zodiacFor(month: number, day: number) {
  const cutoffs = [20,19,20,20,21,21,22,23,23,23,22,22];
  const signs = ["Capricorn","Aquarius","Pisces","Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius"];
  return day < cutoffs[month - 1] ? signs[month - 1] : signs[month % 12];
}

function walletError(error: unknown) {
  const value = error as { code?: number; shortMessage?: string; message?: string };
  if (value.code === 4001) return "Request cancelled in the wallet.";
  if (value.code === 4100) return "The wallet has not authorized this site. Reconnect and approve account access.";
  if (value.code === -32002) return "A wallet request is already open. Check the wallet extension.";
  return value.shortMessage || value.message || "The wallet request failed.";
}

function humanError(error: unknown) { return error instanceof Error ? error.message : "The request could not be completed."; }
function shortAddress(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]!)); }
function escapeAttribute(value: string) { return escapeHtml(value); }
function pluck<T extends HTMLElement>(selector: string) { return $(selector) as T; }

function bindUi() {
  $("#walletButton").addEventListener("click", openWalletDialog);
  $("#closeWalletDialog").addEventListener("click", () => ($("#walletDialog") as HTMLDialogElement).close());
  $("#placeSearch").addEventListener("click", () => void searchPlaces());
  $("#placeQuery").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") { event.preventDefault(); void searchPlaces(); } });
  $("#rebuildForm").addEventListener("submit", (event) => void rebuild(event as SubmitEvent));
  $("#downloadButton").addEventListener("click", () => downloadReport(false));
  $("#downloadBackup").addEventListener("click", () => downloadReport(true));
  $("#keepButton").addEventListener("click", () => void writeRecord("keep"));
  $("#giftButton").addEventListener("click", () => void writeRecord("gift"));
  $$<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    $$<HTMLButtonElement>("[data-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
    const isKeep = button.dataset.mode === "keep";
    $("#keepFields").hidden = !isKeep; $("#giftFields").hidden = isKeep;
  }));
  $$<HTMLButtonElement>("[data-report-tab]").forEach((button) => button.addEventListener("click", () => {
    $$<HTMLButtonElement>("[data-report-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("a[href^='#']")) {
      const link = target.closest("a") as HTMLAnchorElement;
      const section = document.querySelector(link.hash);
      if (section) { event.preventDefault(); section.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
    }
  });
}

void AbiCoder; // retained in the bundle for external verification tooling
bindUi();
collectWallets();
initializeDesignAssets();
