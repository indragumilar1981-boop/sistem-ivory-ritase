import { db, isFirebaseConfigured } from "./firebase.js";
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    addDoc, 
    onSnapshot,
    query,
    orderBy 
} from "firebase/firestore";

/**
 * Sistem Perhitungan Ritase Supir Tanki - Sistem Ivory
 * Core Javascript Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Storage Keys ---
    const STORAGE_KEY_ACTIVE = 'ivory_active_trip';
    const STORAGE_KEY_HISTORY = 'ivory_trip_history';
    const STORAGE_KEY_MASTER = 'ivory_master_tanki';
    const STORAGE_KEY_RATES = 'ivory_rates_settings';
    const STORAGE_KEY_AMT = 'ivory_master_amt';
    
    // Helper to generate mock SVG avatar for AMT
    function createAmtMockSvg(name, role) {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
                <rect width="100%" height="100%" fill="#151f32"/>
                <circle cx="75" cy="65" r="30" fill="#3b82f6" opacity="0.2"/>
                <path d="M45 110 C55 90, 95 90, 105 110" stroke="#3b82f6" stroke-width="3" fill="none"/>
                <text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="10" font-weight="600" fill="#fff">${name}</text>
                <text x="50%" y="98%" dominant-baseline="middle" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-size="8" fill="#9ca3af">${role}</text>
            </svg>
        `;
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg.trim())))}`;
    }

    const DEFAULT_MASTER = [
        { nopol: "B 9182 SFA", kapasitas: 16000 },
        { nopol: "B 9534 SUX", kapasitas: 8000 },
        { nopol: "B 9044 SE", kapasitas: 8000 },
        { nopol: "B 9876 SF", kapasitas: 24000 }
    ];

    const DEFAULT_AMT = [
        { name: "AHMAD FAUZI", jabatan: "AMT 1", foto: createAmtMockSvg("Ahmad Fauzi", "AMT 1") },
        { name: "SLAMET SANTOSO", jabatan: "AMT 2", foto: createAmtMockSvg("Slamet Santoso", "AMT 2") },
        { name: "RUDI HERMAWAN", jabatan: "AMT 1", foto: createAmtMockSvg("Rudi Hermawan", "AMT 1") },
        { name: "JOKO WIDODO", jabatan: "AMT 2", foto: createAmtMockSvg("Joko Widodo", "AMT 2") },
        { name: "DEDI SUSANTO", jabatan: "AMT 1", foto: createAmtMockSvg("Dedi Susanto", "AMT 1") },
        { name: "ANDI WIJAYA", jabatan: "AMT 2", foto: createAmtMockSvg("Andi Wijaya", "AMT 2") }
    ];
    
    let activeTrip = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE)) || null;
    let tripHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
    let masterTanki = JSON.parse(localStorage.getItem(STORAGE_KEY_MASTER));

    // --- Cloud Sync Configuration ---
    const SYNC_BUCKET = "ivory_sync_bucket_2026";
    let syncRoomId = localStorage.getItem('ivory_sync_room_id') || '';
    if (!syncRoomId) {
        syncRoomId = 'IV-' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('ivory_sync_room_id', syncRoomId);
    }

    // Helper to generate mock SVG images for trip documentation
    function createMockSvgImage(title) {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="500" height="375" viewBox="0 0 500 375">
                <rect width="100%" height="100%" fill="#151f32"/>
                <circle cx="250" cy="180" r="70" fill="#2563eb" opacity="0.1"/>
                <path d="M180 230 C220 180, 280 180, 320 230" stroke="#3b82f6" stroke-width="4" fill="none"/>
                <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="22" font-weight="700" fill="#fff">${title}</text>
                <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="12" fill="#9ca3af">Sistem Ritase Ivory - Bukti Foto</text>
                <text x="50%" y="90%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#6b7280">2026-06-18 © Ivory Logistics</text>
            </svg>
        `;
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg.trim())))}`;
    }

    // Migration: Fix legacy raw SVG strings in activeTrip
    if (activeTrip) {
        let needsUpdate = false;
        if (activeTrip.fotoTBBM && (activeTrip.fotoTBBM.includes('<svg') || !activeTrip.fotoTBBM.includes('base64'))) {
            activeTrip.fotoTBBM = createMockSvgImage("Foto di TBBM");
            needsUpdate = true;
        }
        if (activeTrip.fotoTiba && (activeTrip.fotoTiba.includes('<svg') || !activeTrip.fotoTiba.includes('base64'))) {
            activeTrip.fotoTiba = createMockSvgImage("Foto Tiba");
            needsUpdate = true;
        }
        if (needsUpdate) {
            localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeTrip));
        }
    }

    // Migration: Fix legacy raw SVG strings in tripHistory
    let historyNeedsUpdate = false;
    tripHistory = tripHistory.map(trip => {
        let tripUpdated = false;
        if (trip.fotoTBBM && (trip.fotoTBBM.includes('<svg') || !trip.fotoTBBM.includes('base64'))) {
            trip.fotoTBBM = createMockSvgImage("Foto di TBBM");
            tripUpdated = true;
        }
        if (trip.fotoTiba && (trip.fotoTiba.includes('<svg') || !trip.fotoTiba.includes('base64'))) {
            trip.fotoTiba = createMockSvgImage("Foto Tiba");
            tripUpdated = true;
        }
        if (tripUpdated) {
            historyNeedsUpdate = true;
        }
        return trip;
    });
    if (historyNeedsUpdate) {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(tripHistory));
    }

    if (!masterTanki) {
        masterTanki = DEFAULT_MASTER;
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(masterTanki));
    }

    let masterAmt = JSON.parse(localStorage.getItem(STORAGE_KEY_AMT));
    if (!masterAmt) {
        masterAmt = DEFAULT_AMT;
        localStorage.setItem(STORAGE_KEY_AMT, JSON.stringify(masterAmt));
    } else {
        // Migration: Fix legacy raw SVG data in masterAmt to prevent quote-leaking HTML bugs
        let needsUpdate = false;
        masterAmt = masterAmt.map(amt => {
            if (amt.foto && (amt.foto.includes('<svg') || amt.foto.includes('data:image/svg+xml;utf8') || !amt.foto.includes('base64'))) {
                needsUpdate = true;
                return {
                    ...amt,
                    foto: createAmtMockSvg(amt.name, amt.jabatan)
                };
            }
            return amt;
        });
        if (needsUpdate) {
            localStorage.setItem(STORAGE_KEY_AMT, JSON.stringify(masterAmt));
        }
    }

    const DEFAULT_RATES = {
        batasKM: 60,
        uangMakan: 50000,
        ritasePerLiter: 20
    };
    let ratesSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_RATES)) || DEFAULT_RATES;

    // --- DOM Elements ---
    // Steps Panels
    const step1Panel = document.getElementById('step1');
    const step2Panel = document.getElementById('step2');
    const step3Panel = document.getElementById('step3');
    
    // Status Header
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    // Step 1: Mulai Perjalanan
    const startForm = document.getElementById('startTripForm');
    const inputTanggal = document.getElementById('tanggal');
    const inputNoPolisi = document.getElementById('noPolisi');
    const inputNamaAMT1 = document.getElementById('namaAMT1');
    const inputNamaAMT2 = document.getElementById('namaAMT2');
    const inputNoLO = document.getElementById('noLO');
    const inputNoSO = document.getElementById('noSO');
    const inputProduk = document.getElementById('produk');
    const inputQuantity = document.getElementById('quantity');
    const inputKota = document.getElementById('kota');
    const inputTujuan = document.getElementById('tujuan');
    const inputOdoAwal = document.getElementById('odoAwal');
    const fileTBBMInput = document.getElementById('fotoTBBMInput');
    const btnFotoTBBM = document.getElementById('btnFotoTBBM');
    const previewTBBM = document.getElementById('previewTBBM');
    const startGpsCoords = document.getElementById('startGpsCoords');
    const startGpsBox = document.getElementById('startGpsBox');
    
    // Step 2: Tiba di Lokasi
    const arriveForm = document.getElementById('arriveTripForm');
    const summaryLO = document.getElementById('summaryLO');
    const summaryTujuan = document.getElementById('summaryTujuan');
    const summaryOdoAwal = document.getElementById('summaryOdoAwal');
    const summaryStartTime = document.getElementById('summaryStartTime');
    const inputOdoTiba = document.getElementById('odoTiba');
    const fileTibaInput = document.getElementById('fotoTibaInput');
    const btnFotoTiba = document.getElementById('btnFotoTiba');
    const previewTiba = document.getElementById('previewTiba');
    const arriveGpsCoords = document.getElementById('arriveGpsCoords');
    const arriveGpsBox = document.getElementById('arriveGpsBox');
    const btnCancelStep2 = document.getElementById('btnCancelStep2');
    
    // Step 3: Selesaikan Perjalanan
    const completeForm = document.getElementById('completeTripForm');
    const summaryLO3 = document.getElementById('summaryLO3');
    const summaryOdoAwal3 = document.getElementById('summaryOdoAwal3');
    const summaryOdoTiba3 = document.getElementById('summaryOdoTiba3');
    const summaryJarakPergi = document.getElementById('summaryJarakPergi');
    const inputOdoAkhir = document.getElementById('odoAkhir');
    const inputOwnuseQty = document.getElementById('ownuseQty');
    const fileOwnuseInput = document.getElementById('ownuseFotoInput');
    const btnFotoOwnuse = document.getElementById('btnFotoOwnuse');
    const previewOwnuse = document.getElementById('previewOwnuse');
    const fileTolInput = document.getElementById('tolFotoInput');
    const btnFotoTol = document.getElementById('btnFotoTol');
    const previewTol = document.getElementById('previewTol');
    const endGpsCoords = document.getElementById('endGpsCoords');
    const endGpsBox = document.getElementById('endGpsBox');
    const btnCancelStep3 = document.getElementById('btnCancelStep3');
    
    // History & Actions
    const historyList = document.getElementById('historyList');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnClearHistory = document.getElementById('btnClearHistory');
    
    // Admin Toggle Mode & Panel
    const btnModeDriver = document.getElementById('btnModeDriver');
    const btnModeAdmin = document.getElementById('btnModeAdmin');
    const subBrandText = document.getElementById('subBrandText');
    const headerStatusIndicator = document.getElementById('headerStatusIndicator');
    const adminPanel = document.getElementById('adminPanel');
    const driverHistorySection = document.getElementById('driverHistorySection');
    const formSection = document.getElementById('formSection');
    
    // PIN Modal DOM
    const pinModal = document.getElementById('pinModal');
    const btnClosePinModal = document.getElementById('btnClosePinModal');
    const btnSubmitPIN = document.getElementById('btnSubmitPIN');
    const pinInputs = [
        document.getElementById('pin1'),
        document.getElementById('pin2'),
        document.getElementById('pin3'),
        document.getElementById('pin4')
    ];
    
    // Admin Dashboard Elements
    const adminStatTrips = document.getElementById('adminStatTrips');
    const adminStatVolume = document.getElementById('adminStatVolume');
    const adminStatDistance = document.getElementById('adminStatDistance');
    const adminStatUangMakan = document.getElementById('adminStatUangMakan');
    const adminStatUangRitase = document.getElementById('adminStatUangRitase');
    const adminStatTotalRupiah = document.getElementById('adminStatTotalRupiah');
    
    const adminRatesForm = document.getElementById('adminRatesForm');
    const inputRateBatasKM = document.getElementById('rateBatasKM');
    const inputRateUangMakan = document.getElementById('rateUangMakan');
    const inputRateRitasePerLiter = document.getElementById('rateRitasePerLiter');
    
    const activeTripsCount = document.getElementById('activeTripsCount');
    const adminActiveTripsList = document.getElementById('adminActiveTripsList');
    const adminSearchInput = document.getElementById('adminSearchInput');
    const adminHistoryList = document.getElementById('adminHistoryList');
    const btnAdminExport = document.getElementById('btnAdminExport');
    const btnAdminMockData = document.getElementById('btnAdminMockData');
    const btnAdminClearAll = document.getElementById('btnAdminClearAll');
    
    // Admin Master Data Elements
    const adminAddMasterForm = document.getElementById('adminAddMasterForm');
    const inputMasterNopol = document.getElementById('masterNopol');
    const inputMasterKapasitas = document.getElementById('masterKapasitas');
    const adminMasterTbody = document.getElementById('adminMasterTbody');
    const nopolCapacityHint = document.getElementById('nopolCapacityHint');
    const btnSubmitMaster = document.getElementById('btnSubmitMaster');
    const btnCancelMasterEdit = document.getElementById('btnCancelMasterEdit');
    
    // Admin Master AMT Elements
    const adminAmtForm = document.getElementById('adminAmtForm');
    const inputAmtNama = document.getElementById('amtNama');
    const inputAmtJabatan = document.getElementById('amtJabatan');
    const fileAmtFotoInput = document.getElementById('amtFotoInput');
    const btnFotoAmt = document.getElementById('btnFotoAmt');
    const previewAmtFoto = document.getElementById('previewAmtFoto');
    const btnSubmitAmt = document.getElementById('btnSubmitAmt');
    const btnCancelAmtEdit = document.getElementById('btnCancelAmtEdit');
    const adminAmtTbody = document.getElementById('adminAmtTbody');
    
    // Modal
    const detailsModal = document.getElementById('detailsModal');
    const modalBody = document.getElementById('modalBody');
    const btnCloseModal = document.getElementById('btnCloseModal');
    
    // In-App Camera Modal Elements
    const cameraModal = document.getElementById('cameraModal');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const btnCapturePhoto = document.getElementById('btnCapturePhoto');
    const btnCancelCamera = document.getElementById('btnCancelCamera');
    const cameraLoadingState = document.getElementById('cameraLoadingState');
    
    // Firebase Status Badge
    const firebaseStatusBadge = document.getElementById('firebaseStatusBadge');
    
    // Firestore state variables
    let firebaseActiveTrips = [];
    let isSyncing = false;
    let unsubscribeRates = null;
    let unsubscribeMasterTanki = null;
    let unsubscribeMasterAmt = null;
    let unsubscribeActiveTrips = null;
    let unsubscribeHistory = null;

    function updateFirebaseStatusBadge(text, status) {
        if (!firebaseStatusBadge) return;
        firebaseStatusBadge.innerText = text;
        if (status === 'success') {
            firebaseStatusBadge.style.background = "rgba(16, 185, 129, 0.12)";
            firebaseStatusBadge.style.color = "#34d399";
            firebaseStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.25)";
        } else if (status === 'warning') {
            firebaseStatusBadge.style.background = "rgba(245, 158, 11, 0.12)";
            firebaseStatusBadge.style.color = "#fbbf24";
            firebaseStatusBadge.style.borderColor = "rgba(245, 158, 11, 0.25)";
        } else if (status === 'error') {
            firebaseStatusBadge.style.background = "rgba(239, 68, 68, 0.12)";
            firebaseStatusBadge.style.color = "#ef4444";
            firebaseStatusBadge.style.borderColor = "rgba(239, 68, 68, 0.25)";
        } else {
            firebaseStatusBadge.style.background = "rgba(59, 130, 246, 0.12)";
            firebaseStatusBadge.style.color = "#60a5fa";
            firebaseStatusBadge.style.borderColor = "rgba(59, 130, 246, 0.25)";
        }
    }

    async function pushItemToFirestore(key, value) {
        if (!isFirebaseConfigured || !db) return;
        try {
            const parsedVal = JSON.parse(value);
            if (key === STORAGE_KEY_ACTIVE) {
                if (parsedVal) {
                    const docId = parsedVal.noPolisi.replace(/\s+/g, '_');
                    await setDoc(doc(db, "active_trips", docId), parsedVal);
                }
            } else if (key === STORAGE_KEY_HISTORY) {
                if (parsedVal.length === 0) {
                    const querySnap = await getDocs(collection(db, "trip_history"));
                    querySnap.forEach(async (docSnap) => {
                        await deleteDoc(doc(db, "trip_history", docSnap.id));
                    });
                } else {
                    for (let trip of parsedVal) {
                        if (trip.endTime) {
                            const docId = trip.endTime.replace(/[:.]/g, '_');
                            await setDoc(doc(db, "trip_history", docId), trip);
                        }
                    }
                }
            } else if (key === STORAGE_KEY_MASTER) {
                const localNopols = parsedVal.map(t => t.nopol.replace(/\s+/g, '_'));
                const querySnap = await getDocs(collection(db, "master_tanki"));
                querySnap.forEach(async (docSnap) => {
                    if (!localNopols.includes(docSnap.id)) {
                        await deleteDoc(doc(db, "master_tanki", docSnap.id));
                    }
                });
                for (let tanki of parsedVal) {
                    const docId = tanki.nopol.replace(/\s+/g, '_');
                    await setDoc(doc(db, "master_tanki", docId), tanki);
                }
            } else if (key === STORAGE_KEY_AMT) {
                const localNames = parsedVal.map(amt => amt.name.replace(/\s+/g, '_'));
                const querySnap = await getDocs(collection(db, "master_amt"));
                querySnap.forEach(async (docSnap) => {
                    if (!localNames.includes(docSnap.id)) {
                        await deleteDoc(doc(db, "master_amt", docSnap.id));
                    }
                });
                for (let amt of parsedVal) {
                    const docId = amt.name.replace(/\s+/g, '_');
                    await setDoc(doc(db, "master_amt", docId), amt);
                }
            } else if (key === STORAGE_KEY_RATES) {
                await setDoc(doc(db, "rates_settings", "default"), parsedVal);
            }
        } catch (err) {
            console.error("Firestore push item error:", err);
        }
    }

    async function removeItemFromFirestore(key) {
        if (!isFirebaseConfigured || !db) return;
        try {
            if (key === STORAGE_KEY_ACTIVE) {
                // Explicitly handled in cancel/complete handlers
            }
        } catch (err) {
            console.error("Firestore remove item error:", err);
        }
    }

    // Monkey patch localStorage to automatically push to Firestore on updates
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        if (!isSyncing && (key === STORAGE_KEY_ACTIVE || key === STORAGE_KEY_HISTORY || key === STORAGE_KEY_MASTER || key === STORAGE_KEY_AMT || key === STORAGE_KEY_RATES)) {
            if (isFirebaseConfigured && db) {
                pushItemToFirestore(key, value);
            }
        }
    };

    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = function(key) {
        originalRemoveItem.apply(this, arguments);
        if (!isSyncing && (key === STORAGE_KEY_ACTIVE || key === STORAGE_KEY_HISTORY)) {
            if (isFirebaseConfigured && db) {
                removeItemFromFirestore(key);
            }
        }
    };

    function initFirebaseSync() {
        if (!isFirebaseConfigured || !db) {
            updateFirebaseStatusBadge("Offline (Lokal)", "warning");
            return;
        }
        
        updateFirebaseStatusBadge("Menghubungkan...", "info");
        
        // 1. Sync Rates Settings
        unsubscribeRates = onSnapshot(doc(db, "rates_settings", "default"), (docSnap) => {
            isSyncing = true;
            if (docSnap.exists()) {
                ratesSettings = docSnap.data();
                localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(ratesSettings));
            } else {
                setDoc(doc(db, "rates_settings", "default"), DEFAULT_RATES);
            }
            isSyncing = false;
            updateFirebaseStatusBadge("Terhubung", "success");
        }, (err) => {
            console.error("Firestore Rates sync error:", err);
            updateFirebaseStatusBadge("Error Koneksi", "error");
        });
        
        // 2. Sync Master Tanki
        unsubscribeMasterTanki = onSnapshot(collection(db, "master_tanki"), (querySnap) => {
            const list = [];
            querySnap.forEach(docSnap => {
                list.push(docSnap.data());
            });
            isSyncing = true;
            masterTanki = list.length > 0 ? list : DEFAULT_MASTER;
            localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(masterTanki));
            isSyncing = false;
            if (currentMode === 'admin') {
                renderMasterTable();
            } else {
                populateNopolDropdown();
            }
        });
        
        // 3. Sync Master AMT
        unsubscribeMasterAmt = onSnapshot(collection(db, "master_amt"), (querySnap) => {
            const list = [];
            querySnap.forEach(docSnap => {
                list.push(docSnap.data());
            });
            isSyncing = true;
            masterAmt = list.length > 0 ? list : DEFAULT_AMT;
            localStorage.setItem(STORAGE_KEY_AMT, JSON.stringify(masterAmt));
            isSyncing = false;
            if (currentMode === 'admin') {
                renderAmtTable();
            } else {
                populateAmtDropdowns();
            }
        });
        
        // 4. Sync Active Trips
        unsubscribeActiveTrips = onSnapshot(collection(db, "active_trips"), (querySnap) => {
            firebaseActiveTrips = [];
            querySnap.forEach(docSnap => {
                firebaseActiveTrips.push(docSnap.data());
            });
            
            // Sync local activeTrip if it exists in Firestore
            if (activeTrip) {
                const cloudMatch = firebaseActiveTrips.find(t => t.noPolisi === activeTrip.noPolisi);
                if (!cloudMatch) {
                    isSyncing = true;
                    activeTrip = null;
                    localStorage.removeItem(STORAGE_KEY_ACTIVE);
                    isSyncing = false;
                    renderAppView();
                } else if (JSON.stringify(cloudMatch) !== JSON.stringify(activeTrip)) {
                    isSyncing = true;
                    activeTrip = cloudMatch;
                    localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeTrip));
                    isSyncing = false;
                    renderAppView();
                }
            }
            
            if (currentMode === 'admin') {
                renderAdminPanel();
            }
        });
        
        // 5. Sync Trip History
        unsubscribeHistory = onSnapshot(collection(db, "trip_history"), (querySnap) => {
            const list = [];
            querySnap.forEach(docSnap => {
                list.push(docSnap.data());
            });
            list.sort((a, b) => new Date(b.endTime || b.tanggal) - new Date(a.endTime || a.tanggal));
            isSyncing = true;
            tripHistory = list;
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(tripHistory));
            isSyncing = false;
            if (currentMode === 'admin') {
                renderAdminPanel();
            } else {
                renderAppView();
            }
        });
    }
    
    // Toast
    const toastContainer = document.getElementById('toastContainer');

    // --- Temporary Variables for Photos ---
    let tempFotoTBBM = null;
    let tempFotoTiba = null;
    let tempFotoAmt = null;
    let tempFotoOwnuse = null;
    let tempFotoTol = null;

    // Set Default Tanggal to Today
    const today = new Date().toISOString().split('T')[0];
    inputTanggal.value = today;

    // --- Toast Notifications Helper ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        } else {
            iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // --- Image Compression Utility ---
    function compressImage(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 500;
                const MAX_HEIGHT = 500;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with 0.6 quality to save localStorage limit
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function compressBase64Image(base64Str, callback) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 500;
            const MAX_HEIGHT = 500;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            callback(dataUrl);
        };
        img.src = base64Str;
    }

    function compressAmtBase64Image(base64Str, callback) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const SIZE = 150;
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            
            const scale = Math.max(SIZE / img.width, SIZE / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (SIZE - w) / 2;
            const y = (SIZE - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            callback(dataUrl);
        };
        img.src = base64Str;
    }

    let cameraStream = null;

    function openInAppCamera(onCaptureCallback, fallbackInput) {
        // Fallback: If MediaDevices or getUserMedia is not supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Kamera langsung tidak didukung peramban ini. Membuka pemilih file.", "warning");
            if (fallbackInput) fallbackInput.click();
            return;
        }

        // Reset & Show Modal
        cameraModal.classList.remove('hidden');
        cameraLoadingState.style.display = 'flex';
        cameraVideo.style.display = 'none';
        btnCapturePhoto.disabled = true;

        // Stop existing stream if any
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }

        // Camera constraints (default to environment/rear camera)
        const constraints = {
            video: {
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                cameraStream = stream;
                cameraVideo.srcObject = stream;
                cameraVideo.onloadedmetadata = () => {
                    cameraLoadingState.style.display = 'none';
                    cameraVideo.style.display = 'block';
                    btnCapturePhoto.disabled = false;
                };
            })
            .catch(err => {
                console.error("Camera access error:", err);
                cameraModal.classList.add('hidden');
                showToast("Akses kamera ditolak/gagal. Membuka pemilih file bawaan.", "warning");
                if (fallbackInput) fallbackInput.click();
            });

        // Set shutter capture listener
        btnCapturePhoto.onclick = () => {
            if (!cameraStream) return;
            
            // Subtle click animation
            btnCapturePhoto.style.transform = 'scale(0.9)';
            setTimeout(() => btnCapturePhoto.style.transform = 'scale(1)', 100);

            const width = cameraVideo.videoWidth || 640;
            const height = cameraVideo.videoHeight || 480;
            cameraCanvas.width = width;
            cameraCanvas.height = height;

            const ctx = cameraCanvas.getContext('2d');
            // Draw current video frame to canvas
            ctx.drawImage(cameraVideo, 0, 0, width, height);

            // Convert to base64
            const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.8);

            // Stop camera streams
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            cameraModal.classList.add('hidden');

            // Pass capture back to parent callback
            onCaptureCallback(dataUrl);
        };

        // Set cancel listener
        btnCancelCamera.onclick = () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            cameraModal.classList.add('hidden');
        };
    }

    // Handle photo select & compression
    btnFotoTBBM.addEventListener('click', () => {
        openInAppCamera((capturedBase64) => {
            showToast("Memproses foto...", "info");
            compressBase64Image(capturedBase64, (compressedBase64) => {
                tempFotoTBBM = compressedBase64;
                previewTBBM.innerHTML = `<img src="${compressedBase64}" alt="Foto TBBM"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto TBBM berhasil diproses!", "success");
            });
        }, fileTBBMInput);
    });
    fileTBBMInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast("Memproses foto...", "info");
            compressImage(e.target.files[0], (base64Str) => {
                tempFotoTBBM = base64Str;
                previewTBBM.innerHTML = `<img src="${base64Str}" alt="Foto TBBM"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto TBBM berhasil diproses!", "success");
            });
        }
    });

    btnFotoTiba.addEventListener('click', () => {
        openInAppCamera((capturedBase64) => {
            showToast("Memproses foto...", "info");
            compressBase64Image(capturedBase64, (compressedBase64) => {
                tempFotoTiba = compressedBase64;
                previewTiba.innerHTML = `<img src="${compressedBase64}" alt="Foto Tiba"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Tiba berhasil diproses!", "success");
            });
        }, fileTibaInput);
    });
    fileTibaInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast("Memproses foto...", "info");
            compressImage(e.target.files[0], (base64Str) => {
                tempFotoTiba = base64Str;
                previewTiba.innerHTML = `<img src="${base64Str}" alt="Foto Tiba"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Tiba berhasil diproses!", "success");
            });
        }
    });

    btnFotoOwnuse.addEventListener('click', () => {
        openInAppCamera((capturedBase64) => {
            showToast("Memproses foto Struk BBM...", "info");
            compressBase64Image(capturedBase64, (compressedBase64) => {
                tempFotoOwnuse = compressedBase64;
                previewOwnuse.innerHTML = `<img src="${compressedBase64}" alt="Foto Struk BBM" style="width:100%; height:100%; object-fit:cover;"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Struk BBM berhasil diproses!", "success");
            });
        }, fileOwnuseInput);
    });
    fileOwnuseInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast("Memproses foto Struk BBM...", "info");
            compressImage(e.target.files[0], (base64Str) => {
                tempFotoOwnuse = base64Str;
                previewOwnuse.innerHTML = `<img src="${base64Str}" alt="Foto Struk BBM" style="width:100%; height:100%; object-fit:cover;"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Struk BBM berhasil diproses!", "success");
            });
        }
    });

    btnFotoTol.addEventListener('click', () => {
        openInAppCamera((capturedBase64) => {
            showToast("Memproses foto Struk TOL...", "info");
            compressBase64Image(capturedBase64, (compressedBase64) => {
                tempFotoTol = compressedBase64;
                previewTol.innerHTML = `<img src="${compressedBase64}" alt="Foto Struk TOL" style="width:100%; height:100%; object-fit:cover;"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Struk TOL berhasil diproses!", "success");
            });
        }, fileTolInput);
    });
    fileTolInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast("Memproses foto Struk TOL...", "info");
            compressImage(e.target.files[0], (base64Str) => {
                tempFotoTol = base64Str;
                previewTol.innerHTML = `<img src="${base64Str}" alt="Foto Struk TOL" style="width:100%; height:100%; object-fit:cover;"><span class="photo-badge">Tersimpan</span>`;
                showToast("Foto Struk TOL berhasil diproses!", "success");
            });
        }
    });

    // Handle AMT photo select & compression
    btnFotoAmt.addEventListener('click', () => {
        openInAppCamera((capturedBase64) => {
            showToast("Memproses foto AMT...", "info");
            compressAmtBase64Image(capturedBase64, (compressedBase64) => {
                tempFotoAmt = compressedBase64;
                previewAmtFoto.innerHTML = `<img src="${compressedBase64}" alt="Foto AMT" style="width:100%; height:100%; object-fit:cover;">`;
                showToast("Foto AMT berhasil diproses!", "success");
            });
        }, fileAmtFotoInput);
    });
    fileAmtFotoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast("Memproses foto AMT...", "info");
            compressAmtImage(e.target.files[0], (base64Str) => {
                tempFotoAmt = base64Str;
                previewAmtFoto.innerHTML = `<img src="${base64Str}" alt="Foto AMT" style="width:100%; height:100%; object-fit:cover;">`;
                showToast("Foto AMT berhasil diproses!", "success");
            });
        }
    });

    function compressAmtImage(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const SIZE = 150;
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext('2d');
                
                const scale = Math.max(SIZE / img.width, SIZE / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (SIZE - w) / 2;
                const y = (SIZE - h) / 2;
                ctx.drawImage(img, x, y, w, h);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- Accurate GPS Service ---
    function getGPSLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject("Geolocation tidak didukung oleh browser ini.");
                return;
            }
            
            const options = {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0
            };
            
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    resolve({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        acc: Math.round(pos.coords.accuracy)
                    });
                },
                (err) => {
                    let errMsg = "Akses lokasi ditolak.";
                    if (err.code === err.PERMISSION_DENIED) errMsg = "Izin lokasi diblokir. Harap izinkan GPS di browser Anda.";
                    else if (err.code === err.POSITION_UNAVAILABLE) errMsg = "Lokasi GPS tidak dapat diakses.";
                    else if (err.code === err.TIMEOUT) errMsg = "Waktu tunggu GPS habis (Timeout). Hubungkan ke jaringan GPS yang stabil.";
                    reject(errMsg);
                },
                options
            );
        });
    }

    // --- Device Metadata Service ---
    function getDeviceMetadata() {
        const ua = navigator.userAgent;
        let os = "Unknown OS";
        let browser = "Unknown Browser";

        // Simple OS detection
        if (/windows/i.test(ua)) os = "Windows";
        else if (/android/i.test(ua)) os = "Android";
        else if (/ipad|iphone|ipod/i.test(ua)) os = "iOS";
        else if (/macintosh/i.test(ua)) os = "macOS";
        else if (/linux/i.test(ua)) os = "Linux";

        // Simple Browser detection
        if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) browser = "Chrome";
        else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
        else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
        else if (/edge|edg/i.test(ua)) browser = "Edge";
        else if (/opr/i.test(ua)) browser = "Opera";
        
        // Mobile device model hint if available
        let model = "";
        if (os === "Android") {
            const match = ua.match(/Android\s+([^\s;]+);\s+([^;)]+)/);
            if (match && match[2]) {
                model = ` (${match[2].trim()})`;
            }
        }
        
        return {
            os: os + model,
            browser: browser,
            userAgent: ua
        };
    }

    // --- Render View States based on Active Trip ---
    function renderAppView() {
        // Reload from localStorage to ensure we have the latest data if updated in another tab/window
        activeTrip = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE)) || null;
        tripHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
        
        // Hide all steps by default
        step1Panel.classList.add('hidden');
        step2Panel.classList.add('hidden');
        step3Panel.classList.add('hidden');
        
        if (!activeTrip) {
            // STEP 1: Mulai Perjalanan
            step1Panel.classList.remove('hidden');
            
            // Status Header
            statusDot.className = 'pulse-dot idle';
            statusText.innerText = 'Siap Memulai Perjalanan';
            
            // Reset fields
            startForm.reset();
            populateNopolDropdown();
            populateAmtDropdowns();
            inputTanggal.value = today;
            previewTBBM.innerHTML = `<div class="preview-placeholder">Foto belum diambil</div>`;
            tempFotoTBBM = null;
            
            startGpsCoords.innerText = "Belum dideteksi (Klik tombol Mulai untuk merekam)";
            startGpsBox.className = "gps-info-box warning hidden";
        } else {
            // Check active step
            if (activeTrip.step === 2) {
                // STEP 2: Tiba di Lokasi
                step2Panel.classList.remove('hidden');
                
                statusDot.className = 'pulse-dot active';
                statusText.innerText = `Sedang Jalan ke: ${activeTrip.tujuan}`;
                
                // Fill summary
                summaryLO.innerText = `${activeTrip.noLO} / ${activeTrip.noSO}`;
                summaryTujuan.innerText = `${activeTrip.kota} - ${activeTrip.tujuan}`;
                summaryOdoAwal.innerText = `${formatNumber(activeTrip.odoAwal)} km`;
                summaryStartTime.innerText = formatTime(activeTrip.startTime);
                
                // Reset step 2 inputs
                inputOdoTiba.value = '';
                previewTiba.innerHTML = `<div class="preview-placeholder">Foto belum diambil</div>`;
                tempFotoTiba = null;
                
                arriveGpsCoords.innerText = "Belum dideteksi (Klik tombol Tiba untuk merekam)";
                arriveGpsBox.className = "gps-info-box warning hidden";
            } else if (activeTrip.step === 3) {
                // STEP 3: Selesaikan Perjalanan
                step3Panel.classList.remove('hidden');
                
                statusDot.className = 'pulse-dot active';
                statusText.innerText = `Tiba di Lokasi. Menunggu Bongkar & Selesai`;
                
                // Fill summary
                summaryLO3.innerText = `${activeTrip.noLO} / ${activeTrip.noSO}`;
                summaryOdoAwal3.innerText = `${formatNumber(activeTrip.odoAwal)} km`;
                summaryOdoTiba3.innerText = `${formatNumber(activeTrip.odoTiba)} km`;
                
                const jarakPergiVal = activeTrip.odoTiba - activeTrip.odoAwal;
                summaryJarakPergi.innerText = `${formatNumber(jarakPergiVal)} km`;
                
                // Reset step 3 inputs
                inputOdoAkhir.value = '';
                inputOwnuseQty.value = '';
                tempFotoOwnuse = null;
                tempFotoTol = null;
                previewOwnuse.innerHTML = `<div class="preview-placeholder" style="font-size: 11px;">Belum diambil</div>`;
                previewTol.innerHTML = `<div class="preview-placeholder" style="font-size: 11px;">Belum diambil</div>`;
                
                endGpsCoords.innerText = "Belum dideteksi (Klik Selesaikan untuk merekam)";
                endGpsBox.className = "gps-info-box warning hidden";
            }
        }
        
        renderHistoryList();
    }

    // --- Handle Form Submissions & Actions ---
    
    // Step 1: Start Trip
    startForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validation
        if (!inputTanggal.value || !inputNoPolisi.value || !inputNamaAMT1.value || !inputNamaAMT2.value || 
            !inputNoLO.value || !inputNoSO.value || !inputProduk.value || !inputQuantity.value || 
            !inputKota.value || !inputTujuan.value || !inputOdoAwal.value) {
            showToast("Harap isi semua kolom wajib!", "error");
            return;
        }
        
        if (!tempFotoTBBM) {
            showToast("Harap ambil Foto saat di TBBM!", "error");
            return;
        }
        
        // Soft warning if Quantity exceeds MT Capacity
        const selectedNopol = inputNoPolisi.value;
        const matchedTanki = masterTanki.find(t => t.nopol === selectedNopol);
        const qtyVal = parseFloat(inputQuantity.value);
        if (matchedTanki && qtyVal > matchedTanki.kapasitas) {
            showToast(`Peringatan: Quantity (${formatNumber(qtyVal)}L) melebihi kapasitas mobil tanki (${formatNumber(matchedTanki.kapasitas)}L)!`, "warning");
        }

        const btnStart = document.getElementById('btnStartTrip');
        btnStart.disabled = true;
        btnStart.innerText = "Memproses...";
        startGpsCoords.innerText = "Mencari koordinat presisi...";
        
        try {
            const gps = await getGPSLocation();
            
            // Set GPS UI
            startGpsCoords.innerText = `Lat: ${gps.lat.toFixed(6)}, Lng: ${gps.lng.toFixed(6)} (Akurasi: ±${gps.acc}m)`;
            startGpsBox.className = "gps-info-box success hidden";
            
            // Store active trip data
            activeTrip = {
                step: 2,
                tanggal: inputTanggal.value,
                noPolisi: inputNoPolisi.value.toUpperCase(),
                kapasitas: matchedTanki ? matchedTanki.kapasitas : 0,
                namaAMT1: inputNamaAMT1.value,
                namaAMT2: inputNamaAMT2.value,
                noLO: inputNoLO.value,
                noSO: inputNoSO.value,
                produk: inputProduk.value,
                quantity: parseFloat(inputQuantity.value),
                kota: inputKota.value,
                tujuan: inputTujuan.value,
                odoAwal: parseFloat(inputOdoAwal.value),
                fotoTBBM: tempFotoTBBM,
                gpsStart: gps,
                deviceStart: getDeviceMetadata(),
                startTime: new Date().toISOString()
            };
            
            localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeTrip));
            
            setTimeout(() => {
                renderAppView();
                showToast("Perjalanan dimulai!", "success");
            }, 1000);
            
        } catch (err) {
            showToast(err, "error");
            startGpsCoords.innerText = `Error: ${err}`;
            startGpsBox.className = "gps-info-box error hidden";
        } finally {
            btnStart.disabled = false;
            btnStart.innerText = "Mulai Perjalanan";
        }
    });

    // Step 2: Arrive at Location
    arriveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const odoTibaVal = parseFloat(inputOdoTiba.value);
        if (isNaN(odoTibaVal) || odoTibaVal < activeTrip.odoAwal) {
            showToast(`Odometer tiba tidak boleh kurang dari Odo Awal (${activeTrip.odoAwal} km)!`, "error");
            return;
        }
        
        if (!tempFotoTiba) {
            showToast("Harap ambil Foto saat tiba di lokasi!", "error");
            return;
        }

        const btnArrive = document.getElementById('btnArriveTrip');
        btnArrive.disabled = true;
        btnArrive.innerText = "Memproses...";
        arriveGpsCoords.innerText = "Mencari koordinat presisi...";

        try {
            const gps = await getGPSLocation();
            
            arriveGpsCoords.innerText = `Lat: ${gps.lat.toFixed(6)}, Lng: ${gps.lng.toFixed(6)} (Akurasi: ±${gps.acc}m)`;
            arriveGpsBox.className = "gps-info-box success hidden";
            
            // Update Active Trip Data
            activeTrip.step = 3;
            activeTrip.odoTiba = odoTibaVal;
            activeTrip.fotoTiba = tempFotoTiba;
            activeTrip.gpsArrive = gps;
            activeTrip.deviceArrive = getDeviceMetadata();
            activeTrip.arriveTime = new Date().toISOString();
            
            localStorage.setItem(STORAGE_KEY_ACTIVE, JSON.stringify(activeTrip));
            
            setTimeout(() => {
                renderAppView();
                showToast("Berhasil tiba di lokasi pengiriman!", "success");
            }, 1000);
            
        } catch (err) {
            showToast(err, "error");
            arriveGpsCoords.innerText = `Error: ${err}`;
            arriveGpsBox.className = "gps-info-box error hidden";
        } finally {
            btnArrive.disabled = false;
            btnArrive.innerText = "Tiba di Lokasi";
        }
    });

    // Step 3: Complete Trip
    completeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const odoAkhirVal = parseFloat(inputOdoAkhir.value);
        if (isNaN(odoAkhirVal) || odoAkhirVal < activeTrip.odoTiba) {
            showToast(`Odometer akhir tidak boleh kurang dari Odo Tiba (${activeTrip.odoTiba} km)!`, "error");
            return;
        }

        const btnComplete = document.getElementById('btnCompleteTrip');
        btnComplete.disabled = true;
        btnComplete.innerText = "Memproses...";
        endGpsCoords.innerText = "Mencari koordinat presisi...";

        try {
            const gps = await getGPSLocation();
            
            endGpsCoords.innerText = `Lat: ${gps.lat.toFixed(6)}, Lng: ${gps.lng.toFixed(6)} (Akurasi: ±${gps.acc}m)`;
            endGpsBox.className = "gps-info-box success hidden";
            
            const jarakTotalVal = odoAkhirVal - activeTrip.odoAwal;
            const matchedTanki = masterTanki.find(t => t.nopol === activeTrip.noPolisi);
            const kapasitasMobil = activeTrip.kapasitas || (matchedTanki ? matchedTanki.kapasitas : 0);
            
            const tripUangMakan = ratesSettings.uangMakan;
            const tripUangRitase = jarakTotalVal >= ratesSettings.batasKM ? (kapasitasMobil * ratesSettings.ritasePerLiter) : 0;
            const tripTotalRupiah = tripUangMakan + tripUangRitase;

            const ownuseVal = parseFloat(inputOwnuseQty.value);

            // Build completed trip log
            const completedTrip = {
                ...activeTrip,
                odoAkhir: odoAkhirVal,
                ownuse: isNaN(ownuseVal) ? 0 : ownuseVal,
                fotoOwnuse: tempFotoOwnuse,
                fotoTol: tempFotoTol,
                gpsEnd: gps,
                deviceEnd: getDeviceMetadata(),
                endTime: new Date().toISOString(),
                // Calculations
                jarakPergi: activeTrip.odoTiba - activeTrip.odoAwal,
                jarakPulang: odoAkhirVal - activeTrip.odoTiba,
                jarakTotal: jarakTotalVal,
                ritase: 1, // 1 Ritase per trip
                uangMakan: tripUangMakan,
                uangRitase: tripUangRitase,
                totalRupiah: tripTotalRupiah
            };
            
            delete completedTrip.step; // remove step indicator
            
            // Save to history
            tripHistory.unshift(completedTrip); // add to top
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(tripHistory));
            
            // Clear active trip
            if (isFirebaseConfigured && db && activeTrip) {
                const docId = activeTrip.noPolisi.replace(/\s+/g, '_');
                deleteDoc(doc(db, "active_trips", docId));
            }
            activeTrip = null;
            localStorage.removeItem(STORAGE_KEY_ACTIVE);
            
            // Reset input values
            inputOwnuseQty.value = '';
            tempFotoOwnuse = null;
            tempFotoTol = null;
            
            setTimeout(() => {
                renderAppView();
                showToast("Trip selesai dan tersimpan ke riwayat!", "success");
            }, 1000);
            
        } catch (err) {
            showToast(err, "error");
            endGpsCoords.innerText = `Error: ${err}`;
            endGpsBox.className = "gps-info-box error hidden";
        } finally {
            btnComplete.disabled = false;
            btnComplete.innerText = "Selesaikan Trip & Simpan";
        }
    });

    // --- Trip Cancel / Resets ---
    btnCancelStep2.addEventListener('click', () => {
        if (confirm("Apakah Anda yakin ingin membatalkan perjalanan aktif? Semua data trip ini akan dihapus.")) {
            if (isFirebaseConfigured && db && activeTrip) {
                const docId = activeTrip.noPolisi.replace(/\s+/g, '_');
                deleteDoc(doc(db, "active_trips", docId));
            }
            activeTrip = null;
            localStorage.removeItem(STORAGE_KEY_ACTIVE);
            renderAppView();
            showToast("Trip dibatalkan.", "warning");
        }
    });

    btnCancelStep3.addEventListener('click', () => {
        if (confirm("Apakah Anda yakin ingin membatalkan perjalanan aktif? Semua data trip ini akan dihapus.")) {
            if (isFirebaseConfigured && db && activeTrip) {
                const docId = activeTrip.noPolisi.replace(/\s+/g, '_');
                deleteDoc(doc(db, "active_trips", docId));
            }
            activeTrip = null;
            localStorage.removeItem(STORAGE_KEY_ACTIVE);
            
            // Reset Step 3 photo/input states
            inputOwnuseQty.value = '';
            tempFotoOwnuse = null;
            tempFotoTol = null;
            
            renderAppView();
            showToast("Trip dibatalkan.", "warning");
        }
    });

    // --- Render History Lists ---
    function renderHistoryList() {
        if (tripHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="icon-empty">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <p>Belum ada riwayat pengiriman.</p>
                    <span class="sub-text">Mulai perjalanan pertama Anda untuk merekam data ritase.</span>
                </div>
            `;
            return;
        }

        historyList.innerHTML = '';
        tripHistory.forEach((trip, index) => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.addEventListener('click', () => showTripDetails(index));
            
            const kmPerLiter = trip.quantity ? (trip.jarakTotal / trip.quantity).toFixed(4) : '-';
            card.innerHTML = `
                <div class="h-card-top">
                    <div class="h-card-title">
                        <span class="dest">${trip.kota} - ${trip.tujuan}</span>
                        <div class="info-row">
                            <span>LO: ${trip.noLO}</span>
                            <span>•</span>
                            <span>${trip.noPolisi}</span>
                            <span>•</span>
                            <span>${trip.produk} (${formatNumber(trip.quantity)}L)</span>
                            <span>•</span>
                            <span>Rasio: ${kmPerLiter} KM/L</span>
                        </div>
                    </div>
                    <div class="h-card-stats">
                        <span class="dist-badge">${trip.jarakTotal} km</span>
                    </div>
                </div>
                <div class="h-card-bottom">
                    <span class="date">${formatDate(trip.tanggal)}</span>
                    <span class="details-trigger">
                        Detail
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </span>
                </div>
            `;
            historyList.appendChild(card);
        });
    }

    // --- Show Trip Details Modal ---
    function showTripDetails(index) {
        const trip = tripHistory[index];
        if (!trip) return;
        
        const tripUangMakan = trip.uangMakan !== undefined ? trip.uangMakan : ratesSettings.uangMakan;
        const tripUangRitase = trip.uangRitase !== undefined ? trip.uangRitase : (trip.jarakTotal >= ratesSettings.batasKM ? ((trip.kapasitas || 0) * ratesSettings.ritasePerLiter) : 0);
        const tripTotalRupiah = trip.totalRupiah !== undefined ? trip.totalRupiah : (tripUangMakan + tripUangRitase);
        const kmPerLiter = trip.quantity ? (trip.jarakTotal / trip.quantity).toFixed(4) : '-';
        
        modalBody.innerHTML = `
            <!-- Header Ringkasan Info -->
            <div class="detail-sec">
                <div class="detail-sec-title">Informasi Pengiriman</div>
                <div class="detail-grid-info">
                    <div class="info-box-v">
                        <span class="lbl">Tanggal</span>
                        <span class="val">${formatDate(trip.tanggal)}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">No Polisi</span>
                        <span class="val">${trip.noPolisi}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Nama AMT 1</span>
                        <span class="val">${trip.namaAMT1 || '-'}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Nama AMT 2</span>
                        <span class="val">${trip.namaAMT2 || '-'}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">No LO</span>
                        <span class="val">${trip.noLO}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">No SO</span>
                        <span class="val">${trip.noSO}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Produk</span>
                        <span class="val">${trip.produk}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Quantity</span>
                        <span class="val">${formatNumber(trip.quantity)} Liter</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Rasio KM/Liter</span>
                        <span class="val">${kmPerLiter} KM/L</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">BBM Ownuse</span>
                        <span class="val">${trip.ownuse ? formatNumber(trip.ownuse) + ' L' : '-'}</span>
                    </div>
                    <div class="info-box-v span-2">
                        <span class="lbl">Tujuan Pengiriman</span>
                        <span class="val">${trip.kota} - ${trip.tujuan}</span>
                    </div>
                </div>
            </div>

            <!-- Perhitungan Ritase & Jarak -->
            <div class="detail-sec">
                <div class="detail-sec-title">Perhitungan Ritase & Odometer</div>
                <div class="detail-grid-info">
                    <div class="info-box-v">
                        <span class="lbl">Odo Awal</span>
                        <span class="val">${formatNumber(trip.odoAwal)} km</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Odo Tiba</span>
                        <span class="val">${formatNumber(trip.odoTiba)} km</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Odo Akhir</span>
                        <span class="val">${formatNumber(trip.odoAkhir)} km</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Jarak Pergi</span>
                        <span class="val">${trip.jarakPergi} km</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Jarak Pulang</span>
                        <span class="val">${trip.jarakPulang} km</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Jarak Total (Ritase)</span>
                        <span class="val" style="color:var(--success-color); font-weight:700;">${trip.jarakTotal} km</span>
                    </div>
                </div>
            </div>

            <!-- Rincian Biaya (Rupiah) -->
            <div class="detail-sec">
                <div class="detail-sec-title">Rincian Pendapatan / Biaya</div>
                <div class="detail-grid-info">
                    <div class="info-box-v">
                        <span class="lbl">Uang Makan</span>
                        <span class="val">Rp ${formatNumber(tripUangMakan)}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Uang Ritase</span>
                        <span class="val">Rp ${formatNumber(tripUangRitase)}</span>
                    </div>
                    <div class="info-box-v">
                        <span class="lbl">Total Pendapatan</span>
                        <span class="val" style="color:var(--success-color); font-weight:700;">Rp ${formatNumber(tripTotalRupiah)}</span>
                    </div>
                </div>
            </div>

            <!-- GPS Details (Hidden from Driver, Admin can click Title 5x to show) -->
            <div class="detail-sec hidden" id="modalGpsSection">
                <div class="detail-sec-title">Data Geolocation GPS</div>
                <div class="gps-detail-row">
                    <div class="gps-detail-item">
                        <span class="gps-lbl">GPS TBBM:</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.gpsStart.lat.toFixed(6)}, ${trip.gpsStart.lng.toFixed(6)}</span>
                            <a href="https://www.google.com/maps/search/?api=1&query=${trip.gpsStart.lat},${trip.gpsStart.lng}" target="_blank" class="gmaps-link">
                                Lihat di Google Maps
                            </a>
                        </div>
                    </div>
                    <div class="gps-detail-item">
                        <span class="gps-lbl">GPS Tiba:</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.gpsArrive.lat.toFixed(6)}, ${trip.gpsArrive.lng.toFixed(6)}</span>
                            <a href="https://www.google.com/maps/search/?api=1&query=${trip.gpsArrive.lat},${trip.gpsArrive.lng}" target="_blank" class="gmaps-link">
                                Lihat di Google Maps
                            </a>
                        </div>
                    </div>
                    <div class="gps-detail-item">
                        <span class="gps-lbl">GPS Akhir:</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.gpsEnd.lat.toFixed(6)}, ${trip.gpsEnd.lng.toFixed(6)}</span>
                            <a href="https://www.google.com/maps/search/?api=1&query=${trip.gpsEnd.lat},${trip.gpsEnd.lng}" target="_blank" class="gmaps-link">
                                Lihat di Google Maps
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Device Details (Hidden from Driver, Admin can click Title 5x to show) -->
            <div class="detail-sec hidden" id="modalDeviceSection">
                <div class="detail-sec-title">Informasi Perangkat (Device Info)</div>
                <div class="gps-detail-row">
                    <div class="gps-detail-item">
                        <span class="gps-lbl">Perangkat Mulai (TBBM):</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.deviceStart ? `${trip.deviceStart.os} (${trip.deviceStart.browser})` : '-'}</span>
                            ${trip.deviceStart && trip.deviceStart.userAgent ? `<span style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">User-Agent: ${trip.deviceStart.userAgent}</span>` : ''}
                        </div>
                    </div>
                    <div class="gps-detail-item">
                        <span class="gps-lbl">Perangkat Tiba:</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.deviceArrive ? `${trip.deviceArrive.os} (${trip.deviceArrive.browser})` : '-'}</span>
                            ${trip.deviceArrive && trip.deviceArrive.userAgent ? `<span style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">User-Agent: ${trip.deviceArrive.userAgent}</span>` : ''}
                        </div>
                    </div>
                    <div class="gps-detail-item">
                        <span class="gps-lbl">Perangkat Selesai:</span>
                        <div class="gps-val-group">
                            <span class="gps-coords-text">${trip.deviceEnd ? `${trip.deviceEnd.os} (${trip.deviceEnd.browser})` : '-'}</span>
                            ${trip.deviceEnd && trip.deviceEnd.userAgent ? `<span style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">User-Agent: ${trip.deviceEnd.userAgent}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
 
            <!-- Bukti Foto -->
            <div class="detail-sec">
                <div class="detail-sec-title">Bukti Dokumentasi Foto</div>
                <div class="detail-photos-row">
                    <div class="photo-card">
                        <span>Foto TBBM</span>
                        <div class="photo-frame">
                            <img src="${trip.fotoTBBM}" alt="Foto TBBM" onclick="window.open(this.src)">
                        </div>
                    </div>
                    <div class="photo-card">
                        <span>Foto Tiba</span>
                        <div class="photo-frame">
                            <img src="${trip.fotoTiba}" alt="Foto Tiba" onclick="window.open(this.src)">
                        </div>
                    </div>
                    ${trip.fotoOwnuse ? `
                    <div class="photo-card">
                        <span>Struk BBM Ownuse</span>
                        <div class="photo-frame">
                            <img src="${trip.fotoOwnuse}" alt="Struk BBM" onclick="window.open(this.src)">
                        </div>
                    </div>
                    ` : ''}
                    ${trip.fotoTol ? `
                    <div class="photo-card">
                        <span>Struk TOL</span>
                        <div class="photo-frame">
                            <img src="${trip.fotoTol}" alt="Struk TOL" onclick="window.open(this.src)">
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Show GPS details by default if in admin mode, hide by default for driver
        const gpsSection = document.getElementById('modalGpsSection');
        if (gpsSection) {
            if (currentMode === 'admin') {
                gpsSection.classList.remove('hidden');
            } else {
                gpsSection.classList.add('hidden');
            }
        }

        const deviceSection = document.getElementById('modalDeviceSection');
        if (deviceSection) {
            if (currentMode === 'admin') {
                deviceSection.classList.remove('hidden');
            } else {
                deviceSection.classList.add('hidden');
            }
        }
        
        detailsModal.classList.remove('hidden');
    }

    // Secret click to toggle GPS view for admin (click 5 times on modal title)
    let secretClickCount = 0;
    const modalTitle = document.getElementById('modalTitle');
    
    modalTitle.addEventListener('click', () => {
        secretClickCount++;
        if (secretClickCount >= 5) {
            const gpsSection = document.getElementById('modalGpsSection');
            if (gpsSection) {
                gpsSection.classList.toggle('hidden');
            }
            const deviceSection = document.getElementById('modalDeviceSection');
            if (deviceSection) {
                deviceSection.classList.toggle('hidden');
            }
            showToast("Mode Admin: Data GPS & Perangkat ditampilkan", "info");
            secretClickCount = 0; // reset
        }
    });

    btnCloseModal.addEventListener('click', () => {
        detailsModal.classList.add('hidden');
        secretClickCount = 0;
    });

    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.classList.add('hidden');
            secretClickCount = 0;
        }
    });

    // --- CSV Export Function ---
    btnExportCSV.addEventListener('click', () => {
        if (tripHistory.length === 0) {
            showToast("Tidak ada riwayat untuk diekspor.", "warning");
            return;
        }

        // Header CSV with BOM
        let csvContent = "\uFEFF";
        csvContent += "Tanggal Pengiriman,No Polisi,Nama AMT 1,Nama AMT 2,No LO,No SO,Produk,Quantity (L),Kota,Tujuan Pengiriman," +
                      "Odo Awal (km),Odo Tiba (km),Odo Akhir (km),Jarak Pergi (km),Jarak Pulang (km),Jarak Total (km)," +
                      "Rasio KM/Liter,Uang Makan (Rp),Uang Ritase (Rp),Total Rupiah (Rp)," +
                      "Ownuse (Liter),Struk BBM Ownuse,Struk TOL," +
                      "GPS TBBM Lat,GPS TBBM Lng,GPS Tiba Lat,GPS Tiba Lng,GPS Akhir Lat,GPS Akhir Lng," +
                      "Device Mulai,Device Tiba,Device Selesai," +
                      "Waktu Mulai,Waktu Tiba,Waktu Selesai\n";

        // Rows CSV
        tripHistory.forEach(trip => {
            const tripUangMakan = trip.uangMakan !== undefined ? trip.uangMakan : ratesSettings.uangMakan;
            const tripUangRitase = trip.uangRitase !== undefined ? trip.uangRitase : (trip.jarakTotal >= ratesSettings.batasKM ? ((trip.kapasitas || 0) * ratesSettings.ritasePerLiter) : 0);
            const tripTotalRupiah = trip.totalRupiah !== undefined ? trip.totalRupiah : (tripUangMakan + tripUangRitase);
            const kmPerLiter = trip.quantity ? (trip.jarakTotal / trip.quantity).toFixed(4) : '-';

            const row = [
                trip.tanggal,
                trip.noPolisi,
                `"${(trip.namaAMT1 || '').replace(/"/g, '""')}"`,
                `"${(trip.namaAMT2 || '').replace(/"/g, '""')}"`,
                `"${trip.noLO}"`,
                `"${trip.noSO}"`,
                trip.produk,
                trip.quantity,
                `"${trip.kota}"`,
                `"${trip.tujuan.replace(/"/g, '""')}"`,
                trip.odoAwal,
                trip.odoTiba,
                trip.odoAkhir,
                trip.jarakPergi,
                trip.jarakPulang,
                trip.jarakTotal,
                kmPerLiter,
                tripUangMakan,
                tripUangRitase,
                tripTotalRupiah,
                trip.ownuse || 0,
                trip.fotoOwnuse ? "Ada Foto" : "Tidak Ada",
                trip.fotoTol ? "Ada Foto" : "Tidak Ada",
                trip.gpsStart.lat,
                trip.gpsStart.lng,
                trip.gpsArrive.lat,
                trip.gpsArrive.lng,
                trip.gpsEnd.lat,
                trip.gpsEnd.lng,
                trip.deviceStart ? `"${trip.deviceStart.os} (${trip.deviceStart.browser})"` : '"-"',
                trip.deviceArrive ? `"${trip.deviceArrive.os} (${trip.deviceArrive.browser})"` : '"-"',
                trip.deviceEnd ? `"${trip.deviceEnd.os} (${trip.deviceEnd.browser})"` : '"-"',
                trip.startTime,
                trip.arriveTime,
                trip.endTime
            ].join(",");
            csvContent += row + "\n";
        });

        // Download Trigger via Blob (Excel and BOM support)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Laporan_Ritase_Ivory_${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast("Laporan CSV berhasil diunduh!", "success");
    });

    // --- Clear History ---
    btnClearHistory.addEventListener('click', () => {
        if (tripHistory.length === 0) {
            showToast("Riwayat sudah kosong.", "info");
            return;
        }
        
        if (confirm("Apakah Anda yakin ingin menghapus semua riwayat pengiriman? Tindakan ini tidak dapat dibatalkan.")) {
            tripHistory = [];
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(tripHistory));
            renderAppView();
            showToast("Semua riwayat berhasil dihapus.", "success");
        }
    });

    // --- Admin Dashboard Business Logic ---
    let currentMode = 'driver'; // 'driver' or 'admin'
    let isAdminLoggedIn = false;
    let editingMasterIndex = null;
    
    function switchMode(mode) {
        currentMode = mode;
        
        if (mode === 'driver') {
            btnModeDriver.classList.add('active');
            btnModeAdmin.classList.remove('active');
            subBrandText.innerText = "Tanker Driver Dashboard";
            headerStatusIndicator.classList.remove('hidden');
            
            formSection.classList.remove('hidden');
            driverHistorySection.classList.add('hidden');
            adminPanel.classList.add('hidden');
            
            renderAppView();
        } else {
            btnModeDriver.classList.remove('active');
            btnModeAdmin.classList.add('active');
            subBrandText.innerText = "Sistem Ritase Admin";
            headerStatusIndicator.classList.add('hidden');
            
            formSection.classList.add('hidden');
            driverHistorySection.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            
            // Populate rates settings inputs
            inputRateBatasKM.value = ratesSettings.batasKM;
            inputRateUangMakan.value = ratesSettings.uangMakan;
            inputRateRitasePerLiter.value = ratesSettings.ritasePerLiter;
            
            renderAdminPanel();
        }
    }
    
    // Switch Mode Button Handlers
    btnModeDriver.addEventListener('click', () => {
        switchMode('driver');
    });
    
    btnModeAdmin.addEventListener('click', () => {
        if (isAdminLoggedIn) {
            switchMode('admin');
        } else {
            openPinModal();
        }
    });
    
    // PIN Modal Actions
    function openPinModal() {
        pinModal.classList.remove('hidden');
        pinInputs.forEach(input => input.value = '');
        setTimeout(() => pinInputs[0].focus(), 150);
    }
    
    btnClosePinModal.addEventListener('click', () => {
        pinModal.classList.add('hidden');
    });
    
    // Auto-focus move logic for PIN digits
    pinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            // Only allow numbers
            if (!/^[0-9]$/.test(val)) {
                e.target.value = '';
                return;
            }
            if (val.length === 1 && index < 3) {
                pinInputs[index + 1].focus();
            }
            // If all digits filled, submit immediately
            if (pinInputs.every(inp => inp.value.length === 1)) {
                verifyAdminPIN();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                pinInputs[index - 1].focus();
            }
        });
    });
    
    btnSubmitPIN.addEventListener('click', verifyAdminPIN);
    
    function verifyAdminPIN() {
        const pinValue = pinInputs.map(inp => inp.value).join('');
        if (pinValue === '1234') {
            isAdminLoggedIn = true;
            pinModal.classList.add('hidden');
            showToast("Login Admin Berhasil!", "success");
            switchMode('admin');
        } else {
            showToast("PIN salah! PIN bawaan: 1234", "error");
            pinInputs.forEach(input => input.value = '');
            pinInputs[0].focus();
        }
    }
    
    // Render Admin Panel details
    function renderAdminPanel() {
        // Reload from localStorage to ensure we have the latest data if updated in another tab/window
        activeTrip = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE)) || null;
        tripHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
        masterTanki = JSON.parse(localStorage.getItem(STORAGE_KEY_MASTER)) || DEFAULT_MASTER;
        masterAmt = JSON.parse(localStorage.getItem(STORAGE_KEY_AMT)) || DEFAULT_AMT;
        ratesSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_RATES)) || DEFAULT_RATES;

        if (inputSyncRoomId) {
            inputSyncRoomId.value = syncRoomId;
        }

        // 1. Calculate and display stats
        const totalTrips = tripHistory.length;
        const totalVolume = tripHistory.reduce((acc, t) => acc + (t.quantity || 0), 0);
        const totalDistance = tripHistory.reduce((acc, t) => acc + (t.jarakTotal || 0), 0);
        
        adminStatTrips.innerText = formatNumber(totalTrips);
        adminStatVolume.innerText = `${formatNumber(totalVolume)} L`;
        adminStatDistance.innerText = `${formatNumber(totalDistance)} km`;
        
        // Calculate and render financial stats
        const totalUangMakan = tripHistory.reduce((acc, t) => {
            const val = t.uangMakan !== undefined ? t.uangMakan : ratesSettings.uangMakan;
            return acc + val;
        }, 0);
        const totalUangRitase = tripHistory.reduce((acc, t) => {
            const val = t.uangRitase !== undefined ? t.uangRitase : (t.jarakTotal >= ratesSettings.batasKM ? ((t.kapasitas || 0) * ratesSettings.ritasePerLiter) : 0);
            return acc + val;
        }, 0);
        const totalRupiah = totalUangMakan + totalUangRitase;

        adminStatUangMakan.innerText = `Rp ${formatNumber(totalUangMakan)}`;
        adminStatUangRitase.innerText = `Rp ${formatNumber(totalUangRitase)}`;
        adminStatTotalRupiah.innerText = `Rp ${formatNumber(totalRupiah)}`;
        
        // Render Master Data Table
        renderMasterTable();
        renderAmtTable();
        
        // 2. Render Active Trips
        adminActiveTripsList.innerHTML = '';
        
        const tripsToRender = (isFirebaseConfigured && db) ? firebaseActiveTrips : (activeTrip ? [activeTrip] : []);
        
        if (tripsToRender.length > 0) {
            activeTripsCount.innerText = `${tripsToRender.length} Aktif`;
            activeTripsCount.className = "active-badge";
            
            tripsToRender.forEach((trip, index) => {
                const startDt = new Date(trip.startTime);
                const timeDiff = Math.abs(new Date() - startDt);
                const hours = Math.floor(timeDiff / (1000 * 60 * 60));
                const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                const durationText = hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`;
                
                const activeCard = document.createElement('div');
                activeCard.className = 'active-trip-card';
                activeCard.style.marginBottom = '14px';
                
                const photoId = `activeTripPhotoThumb_${index}`;
                
                activeCard.innerHTML = `
                    <div class="active-card-top">
                        <div class="active-driver-info">
                            <span class="name">${trip.namaAMT1} (AMT 1) / ${trip.namaAMT2} (AMT 2)</span>
                            <span class="sub-info">LO: ${trip.noLO} | SO: ${trip.noSO}</span>
                        </div>
                        <span class="active-status-badge">Tahap ${trip.step - 1}</span>
                    </div>
                    <div class="active-card-body">
                        <div>
                            <span class="lbl">No Polisi:</span>
                            <span class="val">${trip.noPolisi}</span>
                        </div>
                        <div>
                            <span class="lbl">Produk / Qty:</span>
                            <span class="val">${trip.produk} (${formatNumber(trip.quantity)}L)</span>
                        </div>
                        <div>
                            <span class="lbl">Tujuan:</span>
                            <span class="val">${trip.kota} - ${trip.tujuan}</span>
                        </div>
                        <div>
                            <span class="lbl">Durasi Jalan:</span>
                            <span class="val">${durationText}</span>
                        </div>
                    </div>
                    <div class="active-card-photo-gps">
                        <span class="thumb-btn" id="${photoId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;display:inline;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                            </svg>
                            Lihat Foto TBBM
                        </span>
                        <a href="https://www.google.com/maps/search/?api=1&query=${trip.gpsStart.lat},${trip.gpsStart.lng}" target="_blank" class="gps-link">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;display:inline;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            GPS Start Maps
                        </a>
                    </div>
                `;
                adminActiveTripsList.appendChild(activeCard);
                
                // Add click photo listener
                document.getElementById(photoId).addEventListener('click', () => {
                    window.open(trip.fotoTBBM);
                });
            });
        } else {
            activeTripsCount.innerText = "0 Aktif";
            activeTripsCount.className = "active-badge";
            adminActiveTripsList.innerHTML = `
                <div class="empty-state" style="padding: 20px 0;">
                    <p style="font-size:12px; color:var(--text-muted);">Tidak ada supir sedang berjalan.</p>
                </div>
            `;
        }
        
        // 3. Render Completed History list
        renderAdminHistoryList();
    }
    
    function renderAdminHistoryList() {
        const query = adminSearchInput.value.toLowerCase().trim();
        const filteredTrips = tripHistory.filter(trip => {
            return (
                trip.noPolisi.toLowerCase().includes(query) ||
                trip.kota.toLowerCase().includes(query) ||
                trip.noLO.toLowerCase().includes(query) ||
                trip.noSO.toLowerCase().includes(query) ||
                (trip.namaAMT1 || '').toLowerCase().includes(query) ||
                (trip.namaAMT2 || '').toLowerCase().includes(query) ||
                trip.produk.toLowerCase().includes(query)
            );
        });
        
        adminHistoryList.innerHTML = '';
        
        if (filteredTrips.length === 0) {
            adminHistoryList.innerHTML = `
                <div class="empty-state" style="padding: 20px 0;">
                    <p style="font-size:12px; color:var(--text-muted);">Tidak ada riwayat pengiriman yang cocok.</p>
                </div>
            `;
            return;
        }
        
        filteredTrips.forEach(trip => {
            const origIndex = tripHistory.indexOf(trip);
            const card = document.createElement('div');
            card.className = 'history-card';
            card.addEventListener('click', () => showTripDetails(origIndex));
            
            const tripUangMakan = trip.uangMakan !== undefined ? trip.uangMakan : ratesSettings.uangMakan;
            const tripUangRitase = trip.uangRitase !== undefined ? trip.uangRitase : (trip.jarakTotal >= ratesSettings.batasKM ? ((trip.kapasitas || 0) * ratesSettings.ritasePerLiter) : 0);
            const tripTotalRupiah = trip.totalRupiah !== undefined ? trip.totalRupiah : (tripUangMakan + tripUangRitase);
            const kmPerLiter = trip.quantity ? (trip.jarakTotal / trip.quantity).toFixed(4) : '-';

            card.innerHTML = `
                <div class="h-card-top">
                    <div class="h-card-title">
                        <span class="dest">${trip.kota} - ${trip.tujuan}</span>
                        <div class="info-row" style="margin-top:4px;">
                            <span>AMT: ${trip.namaAMT1} & ${trip.namaAMT2}</span>
                        </div>
                        <div class="info-row" style="margin-top:2px;">
                            <span>LO: ${trip.noLO} | SO: ${trip.noSO}</span>
                            <span>•</span>
                            <span>${trip.noPolisi}</span>
                            <span>•</span>
                            <span>Rasio: ${kmPerLiter} KM/L</span>
                        </div>
                        <div class="info-row" style="margin-top:2px; color:#60a5fa; font-weight:600;">
                            <span>${trip.produk} (${formatNumber(trip.quantity)}L)</span>
                        </div>
                        <div class="info-row" style="margin-top:2px; color:#34d399; font-weight:600;">
                            <span>Biaya: Rp ${formatNumber(tripTotalRupiah)}</span>
                            <span style="color:var(--text-muted); font-weight:normal; font-size:11px; margin-left:4px;">
                                (Makan: Rp ${formatNumber(tripUangMakan)} | Ritase: Rp ${formatNumber(tripUangRitase)})
                            </span>
                        </div>
                    </div>
                    <div class="h-card-stats">
                        <span class="dist-badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; border-color:rgba(59,130,246,0.25);">
                            Total: ${trip.jarakTotal} km
                        </span>
                    </div>
                </div>
                <div class="h-card-bottom" style="margin-top:8px;">
                    <span class="date">${formatDate(trip.tanggal)}</span>
                    <span class="details-trigger" style="color:var(--warning-color);">
                        Rincian GPS & Foto
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;display:inline;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </span>
                </div>
            `;
            adminHistoryList.appendChild(card);
        });
    }

    // Search input listener
    adminSearchInput.addEventListener('input', renderAdminHistoryList);
    
    // Mock Data Generator Trigger
    btnAdminMockData.addEventListener('click', () => {
        showToast("Memproses data simulasi...", "info");
        
        const mockTrips = [
            {
                tanggal: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().split('T')[0], // kemarin
                noPolisi: "B 9182 SFA",
                kapasitas: 16000,
                namaAMT1: "AHMAD FAUZI",
                namaAMT2: "SLAMET SANTOSO",
                noLO: "LO-9002930",
                noSO: "SO-8004920",
                produk: "Bio Solar",
                quantity: 16000,
                kota: "Karawang",
                tujuan: "SPBU 34-41302, Jl. Interchange Karawang Barat",
                odoAwal: 124500,
                odoTiba: 124562,
                odoAkhir: 124624,
                fotoTBBM: createMockSvgImage("Foto di TBBM Karawang"),
                fotoTiba: createMockSvgImage("Foto Tiba di SPBU Karawang"),
                ownuse: 15.5,
                fotoOwnuse: createMockSvgImage("Struk BBM Karawang - 15.5L"),
                fotoTol: createMockSvgImage("Struk Tol Karawang"),
                gpsStart: { lat: -6.112940, lng: 106.890320, acc: 8 },
                gpsArrive: { lat: -6.312010, lng: 107.294010, acc: 10 },
                gpsEnd: { lat: -6.113040, lng: 106.890410, acc: 6 },
                startTime: new Date(Date.now() - 1000 * 60 * 60 * 24 - 1000 * 60 * 180).toISOString(),
                arriveTime: new Date(Date.now() - 1000 * 60 * 60 * 24 - 1000 * 60 * 90).toISOString(),
                endTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
                jarakPergi: 62,
                jarakPulang: 62,
                jarakTotal: 124,
                ritase: 1
            },
            {
                tanggal: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString().split('T')[0], // 2 hari lalu
                noPolisi: "B 9534 SUX",
                kapasitas: 8000,
                namaAMT1: "RUDI HERMAWAN",
                namaAMT2: "JOKO WIDODO",
                noLO: "LO-9002511",
                noSO: "SO-8004122",
                produk: "Pertalite",
                quantity: 8000,
                kota: "Bandung",
                tujuan: "SPBU 34-40115, Jl. Dago No.125 Bandung",
                odoAwal: 110200,
                odoTiba: 110345,
                odoAkhir: 110490,
                fotoTBBM: createMockSvgImage("Foto di TBBM Plumpang"),
                fotoTiba: createMockSvgImage("Foto Tiba di SPBU Dago Bandung"),
                ownuse: 32.0,
                fotoOwnuse: createMockSvgImage("Struk BBM Bandung - 32L"),
                fotoTol: createMockSvgImage("Struk Tol Bandung"),
                gpsStart: { lat: -6.112940, lng: 106.890320, acc: 9 },
                gpsArrive: { lat: -6.890120, lng: 107.616230, acc: 12 },
                gpsEnd: { lat: -6.113200, lng: 106.890520, acc: 7 },
                startTime: new Date(Date.now() - 1000 * 60 * 60 * 48 - 1000 * 60 * 360).toISOString(),
                arriveTime: new Date(Date.now() - 1000 * 60 * 60 * 48 - 1000 * 60 * 180).toISOString(),
                endTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
                jarakPergi: 145,
                jarakPulang: 145,
                jarakTotal: 290,
                ritase: 1
            },
            {
                tanggal: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString().split('T')[0], // 3 hari lalu
                noPolisi: "B 9044 SE",
                kapasitas: 8000,
                namaAMT1: "DEDI SUSANTO",
                namaAMT2: "ANDI WIJAYA",
                noLO: "LO-9002104",
                noSO: "SO-8003901",
                produk: "Pertamina Dex",
                quantity: 8000,
                kota: "Bekasi",
                tujuan: "SPBU 34-17105, Jl. Jend. Sudirman Bekasi",
                odoAwal: 95400,
                odoTiba: 95432,
                odoAkhir: 95464,
                fotoTBBM: createMockSvgImage("Foto di TBBM Cikampek"),
                fotoTiba: createMockSvgImage("Foto Tiba di SPBU Bekasi"),
                ownuse: 0,
                fotoOwnuse: null,
                fotoTol: null,
                gpsStart: { lat: -6.402940, lng: 107.450320, acc: 11 },
                gpsArrive: { lat: -6.230120, lng: 106.996230, acc: 8 },
                gpsEnd: { lat: -6.403200, lng: 107.450520, acc: 10 },
                startTime: new Date(Date.now() - 1000 * 60 * 60 * 72 - 1000 * 60 * 120).toISOString(),
                arriveTime: new Date(Date.now() - 1000 * 60 * 60 * 72 - 1000 * 60 * 60).toISOString(),
                endTime: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
                jarakPergi: 32,
                jarakPulang: 32,
                jarakTotal: 64,
                ritase: 1
            }
        ];
        
        const processedMockTrips = mockTrips.map(trip => {
            const uangMakan = ratesSettings.uangMakan;
            const uangRitase = trip.jarakTotal >= ratesSettings.batasKM ? (trip.kapasitas * ratesSettings.ritasePerLiter) : 0;
            const totalRupiah = uangMakan + uangRitase;
            return {
                ...trip,
                deviceStart: { os: "Android (Xiaomi Redmi Note 13)", browser: "Chrome", userAgent: "Mozilla/5.0 (Linux; Android 10; Redmi Note 13)" },
                deviceArrive: { os: "Android (Xiaomi Redmi Note 13)", browser: "Chrome", userAgent: "Mozilla/5.0 (Linux; Android 10; Redmi Note 13)" },
                deviceEnd: { os: "Android (Xiaomi Redmi Note 13)", browser: "Chrome", userAgent: "Mozilla/5.0 (Linux; Android 10; Redmi Note 13)" },
                uangMakan,
                uangRitase,
                totalRupiah
            };
        });
        
        tripHistory = [...tripHistory, ...processedMockTrips];
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(tripHistory));
        
        setTimeout(() => {
            renderAdminPanel();
            renderAppView();
            showToast("3 Data simulasi berhasil dibuat!", "success");
        }, 600);
    });
    
    // Admin Export Click logic
    btnAdminExport.addEventListener('click', () => {
        btnExportCSV.click();
    });

    // Reset Database
    btnAdminClearAll.addEventListener('click', () => {
        if (confirm("PERINGATAN: Apakah Anda yakin ingin menghapus seluruh database? Semua riwayat perjalanan dan status aktif saat ini akan dihapus permanen!")) {
            if (isFirebaseConfigured && db) {
                // Delete active trips from Firestore
                getDocs(collection(db, "active_trips")).then(qs => {
                    qs.forEach(docSnap => deleteDoc(doc(db, "active_trips", docSnap.id)));
                });
                // Delete trip history from Firestore
                getDocs(collection(db, "trip_history")).then(qs => {
                    qs.forEach(docSnap => deleteDoc(doc(db, "trip_history", docSnap.id)));
                });
            }
            
            isSyncing = true;
            activeTrip = null;
            tripHistory = [];
            localStorage.removeItem(STORAGE_KEY_ACTIVE);
            localStorage.removeItem(STORAGE_KEY_HISTORY);
            isSyncing = false;
            
            showToast("Database berhasil dikosongkan.", "success");
            switchMode('driver');
        }
    });

    // --- Admin Master Data Logic ---
    function populateNopolDropdown() {
        // Clear previous options except placeholder
        inputNoPolisi.innerHTML = '<option value="" disabled selected>-- Pilih No Polisi MT --</option>';
        
        masterTanki.forEach(tanki => {
            const opt = document.createElement('option');
            opt.value = tanki.nopol;
            opt.innerText = `${tanki.nopol} (Kapasitas: ${formatNumber(tanki.kapasitas)} L)`;
            inputNoPolisi.appendChild(opt);
        });
        
        nopolCapacityHint.innerText = "Pilih kendaraan untuk melihat kapasitas.";
        nopolCapacityHint.className = "input-hint";
    }

    // Dropdown change listener to update capacity hint
    inputNoPolisi.addEventListener('change', () => {
        const selectedNopol = inputNoPolisi.value;
        const matched = masterTanki.find(t => t.nopol === selectedNopol);
        if (matched) {
            nopolCapacityHint.innerText = `Kapasitas Mobil Tanki: ${formatNumber(matched.kapasitas)} L`;
            nopolCapacityHint.className = "input-hint text-highlight";
        } else {
            nopolCapacityHint.innerText = "Pilih kendaraan untuk melihat kapasitas.";
            nopolCapacityHint.className = "input-hint";
        }
    });

    function renderMasterTable() {
        adminMasterTbody.innerHTML = '';
        
        if (masterTanki.length === 0) {
            adminMasterTbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 16px 12px;">
                        Tidak ada data Mobil Tanki.
                    </td>
                </tr>
            `;
            return;
        }
        
        masterTanki.forEach((tanki, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${tanki.nopol}</strong></td>
                <td>${formatNumber(tanki.kapasitas)} L</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                        <button class="btn-edit-row" data-index="${index}" title="Edit" style="background:transparent; border:none; color:#3b82f6; cursor:pointer; padding:4px; display:inline-flex; border-radius:4px; transition:all 0.2s ease;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.84a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                        </button>
                        <button class="btn-delete-row" data-index="${index}" title="Hapus" style="background:transparent; border:none; color:var(--danger-color); cursor:pointer; padding:4px; display:inline-flex; border-radius:4px; transition:all 0.2s ease;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            adminMasterTbody.appendChild(tr);
        });
        
        // Add delete listeners
        adminMasterTbody.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                const truckToDelete = masterTanki[idx];
                if (confirm(`Apakah Anda yakin ingin menghapus Mobil Tanki ${truckToDelete.nopol}?`)) {
                    masterTanki.splice(idx, 1);
                    localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(masterTanki));
                    
                    // Adjust editing index if shifted
                    if (editingMasterIndex === idx) {
                        resetMasterEditState();
                    } else if (editingMasterIndex > idx) {
                        editingMasterIndex--;
                    }
                    
                    renderMasterTable();
                    populateNopolDropdown();
                    showToast("Mobil Tanki berhasil dihapus.", "success");
                }
            });
        });

        // Add edit listeners
        adminMasterTbody.querySelectorAll('.btn-edit-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                const truckToEdit = masterTanki[idx];
                
                editingMasterIndex = idx;
                inputMasterNopol.value = truckToEdit.nopol;
                inputMasterKapasitas.value = truckToEdit.kapasitas;
                
                btnSubmitMaster.innerText = "Simpan";
                btnCancelMasterEdit.classList.remove('hidden');
                
                inputMasterNopol.focus();
                showToast(`Mengedit Mobil Tanki ${truckToEdit.nopol}`, "info");
            });
        });
    }

    // Cancel Edit Handler
    btnCancelMasterEdit.addEventListener('click', () => {
        resetMasterEditState();
    });
    
    function resetMasterEditState() {
        editingMasterIndex = null;
        adminAddMasterForm.reset();
        btnSubmitMaster.innerText = "Tambah";
        btnCancelMasterEdit.classList.add('hidden');
    }

    // Add / Update Master Data Form Listener
    adminAddMasterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nopolVal = inputMasterNopol.value.trim().toUpperCase();
        const kapasitasVal = parseFloat(inputMasterKapasitas.value);
        
        if (!nopolVal || isNaN(kapasitasVal) || kapasitasVal <= 0) {
            showToast("Harap isi Nopol dan Kapasitas dengan benar!", "error");
            return;
        }
        
        // Check duplicate (ignore if it's the item being edited itself)
        const exists = masterTanki.some((t, idx) => t.nopol === nopolVal && idx !== editingMasterIndex);
        if (exists) {
            showToast(`Mobil Tanki ${nopolVal} sudah terdaftar!`, "error");
            return;
        }
        
        if (editingMasterIndex !== null) {
            // Update
            masterTanki[editingMasterIndex] = { nopol: nopolVal, kapasitas: kapasitasVal };
            showToast(`Mobil Tanki ${nopolVal} berhasil diperbarui!`, "success");
        } else {
            // Create
            masterTanki.push({ nopol: nopolVal, kapasitas: kapasitasVal });
            showToast(`Mobil Tanki ${nopolVal} berhasil ditambahkan!`, "success");
        }
        
        // Save
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(masterTanki));
        
        // Reset & Refresh
        resetMasterEditState();
        renderMasterTable();
        populateNopolDropdown();
    });

    // --- AMT Master Data Logic ---
    function populateAmtDropdowns() {
        // Clear previous options except placeholder
        inputNamaAMT1.innerHTML = '<option value="" disabled selected>-- Pilih AMT 1 (Supir) --</option>';
        inputNamaAMT2.innerHTML = '<option value="" disabled selected>-- Pilih AMT 2 (Kernet) --</option>';
        
        masterAmt.forEach(amt => {
            const opt = document.createElement('option');
            opt.value = amt.name;
            opt.innerText = amt.name;
            
            if (amt.jabatan === 'AMT 1') {
                inputNamaAMT1.appendChild(opt);
            } else if (amt.jabatan === 'AMT 2') {
                inputNamaAMT2.appendChild(opt);
            }
        });
    }

    let editingAmtIndex = null;

    function renderAmtTable() {
        adminAmtTbody.innerHTML = '';
        
        if (masterAmt.length === 0) {
            adminAmtTbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px 12px;">
                        Tidak ada data Awak Mobil Tanki (AMT).
                    </td>
                </tr>
            `;
            return;
        }
        
        masterAmt.forEach((amt, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <img src="${amt.foto || createAmtMockSvg(amt.name, amt.jabatan)}" class="amt-thumb-circle" alt="${amt.name}">
                </td>
                <td><strong>${amt.name}</strong></td>
                <td><span class="badge" style="background:rgba(59,130,246,0.1); color:#60a5fa; border:none; padding:2px 8px;">${amt.jabatan}</span></td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                        <button class="btn-edit-amt" data-index="${index}" title="Edit" style="background:transparent; border:none; color:#3b82f6; cursor:pointer; padding:4px; display:inline-flex; border-radius:4px; transition:all 0.2s ease;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.84a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                        </button>
                        <button class="btn-delete-amt" data-index="${index}" title="Hapus" style="background:transparent; border:none; color:var(--danger-color); cursor:pointer; padding:4px; display:inline-flex; border-radius:4px; transition:all 0.2s ease;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </div>
                </td>
            `;
            adminAmtTbody.appendChild(tr);
        });
        
        // Add delete listeners for AMT
        adminAmtTbody.querySelectorAll('.btn-delete-amt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                const amtToDelete = masterAmt[idx];
                if (confirm(`Apakah Anda yakin ingin menghapus AMT ${amtToDelete.name}?`)) {
                    masterAmt.splice(idx, 1);
                    localStorage.setItem(STORAGE_KEY_AMT, JSON.stringify(masterAmt));
                    
                    if (editingAmtIndex === idx) {
                        resetAmtEditState();
                    } else if (editingAmtIndex > idx) {
                        editingAmtIndex--;
                    }
                    
                    renderAmtTable();
                    populateAmtDropdowns();
                    showToast("Data AMT berhasil dihapus.", "success");
                }
            });
        });

        // Add edit listeners for AMT
        adminAmtTbody.querySelectorAll('.btn-edit-amt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                const amtToEdit = masterAmt[idx];
                
                editingAmtIndex = idx;
                inputAmtNama.value = amtToEdit.name;
                inputAmtJabatan.value = amtToEdit.jabatan;
                
                if (amtToEdit.foto) {
                    tempFotoAmt = amtToEdit.foto;
                    previewAmtFoto.innerHTML = `<img src="${amtToEdit.foto}" alt="Foto AMT" style="width:100%; height:100%; object-fit:cover;">`;
                } else {
                    tempFotoAmt = null;
                    previewAmtFoto.innerHTML = `<span style="font-size: 9px; color: var(--text-muted);">Foto</span>`;
                }
                
                btnSubmitAmt.innerText = "Simpan";
                btnCancelAmtEdit.classList.remove('hidden');
                
                inputAmtNama.focus();
                showToast(`Mengedit AMT ${amtToEdit.name}`, "info");
            });
        });
    }

    // Cancel AMT Edit Handler
    btnCancelAmtEdit.addEventListener('click', () => {
        resetAmtEditState();
    });
    
    function resetAmtEditState() {
        editingAmtIndex = null;
        adminAmtForm.reset();
        tempFotoAmt = null;
        previewAmtFoto.innerHTML = `<span style="font-size: 9px; color: var(--text-muted);">Foto</span>`;
        btnSubmitAmt.innerText = "Tambah";
        btnCancelAmtEdit.classList.add('hidden');
    }

    // Add / Update AMT Data Form Listener
    adminAmtForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const namaVal = inputAmtNama.value.trim().toUpperCase();
        const jabatanVal = inputAmtJabatan.value;
        
        if (!namaVal || !jabatanVal) {
            showToast("Harap isi Nama dan Jabatan AMT dengan benar!", "error");
            return;
        }
        
        // Use SVG avatar if no photo taken
        const fotoVal = tempFotoAmt || createAmtMockSvg(namaVal, jabatanVal);
        
        // Check duplicate
        const exists = masterAmt.some((a, idx) => a.name === namaVal && idx !== editingAmtIndex);
        if (exists) {
            showToast(`AMT dengan nama ${namaVal} sudah terdaftar!`, "error");
            return;
        }
        
        if (editingAmtIndex !== null) {
            // Update
            masterAmt[editingAmtIndex] = { name: namaVal, jabatan: jabatanVal, foto: fotoVal };
            showToast(`Data AMT ${namaVal} berhasil diperbarui!`, "success");
        } else {
            // Create
            masterAmt.push({ name: namaVal, jabatan: jabatanVal, foto: fotoVal });
            showToast(`Data AMT ${namaVal} berhasil ditambahkan!`, "success");
        }
        
        // Save
        localStorage.setItem(STORAGE_KEY_AMT, JSON.stringify(masterAmt));
        
        // Reset & Refresh
        resetAmtEditState();
        renderAmtTable();
        populateAmtDropdowns();
    });

    // --- Helpers / Utility Formatters ---
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    function formatDate(dateStr) {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateStr).toLocaleDateString('id-ID', options);
    }

    function formatTime(isoStr) {
        const date = new Date(isoStr);
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    }

    // Admin Rates settings form listener
    adminRatesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const batasKMVal = parseFloat(inputRateBatasKM.value);
        const uangMakanVal = parseFloat(inputRateUangMakan.value);
        const ritasePerLiterVal = parseFloat(inputRateRitasePerLiter.value);
        
        if (isNaN(batasKMVal) || batasKMVal <= 0 || isNaN(uangMakanVal) || uangMakanVal < 0 || isNaN(ritasePerLiterVal) || ritasePerLiterVal < 0) {
            showToast("Harap isi semua konfigurasi tarif dengan benar!", "error");
            return;
        }
        
        ratesSettings = {
            batasKM: batasKMVal,
            uangMakan: uangMakanVal,
            ritasePerLiter: ritasePerLiterVal
        };
        
        localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(ratesSettings));
        showToast("Konfigurasi Tarif & Biaya berhasil disimpan!", "success");
        renderAdminPanel();
    });

    // --- Initial Load ---
    renderAppView();
    initFirebaseSync();

    // Tab Sync: Listen to localStorage modifications in other tabs/windows
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_ACTIVE || e.key === STORAGE_KEY_HISTORY || e.key === STORAGE_KEY_MASTER || e.key === STORAGE_KEY_AMT || e.key === STORAGE_KEY_RATES) {
            activeTrip = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE)) || null;
            tripHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
            masterTanki = JSON.parse(localStorage.getItem(STORAGE_KEY_MASTER)) || DEFAULT_MASTER;
            masterAmt = JSON.parse(localStorage.getItem(STORAGE_KEY_AMT)) || DEFAULT_AMT;
            ratesSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_RATES)) || DEFAULT_RATES;
            
            if (currentMode === 'admin') {
                renderAdminPanel();
            } else {
                renderAppView();
            }
        }
    });
});
