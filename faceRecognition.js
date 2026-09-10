import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

export async function loadFaceModels() {
    if (modelsLoaded) return;
    try {
        const MODEL_URL = '/models';
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoaded = true;
        console.log("Face API Models loaded successfully.");
    } catch (err) {
        console.error("Failed to load Face API models:", err);
    }
}

export async function getFaceDescriptorFromBase64(base64Image) {
    if (!modelsLoaded) await loadFaceModels();
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
            try {
                const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                if (detection) {
                    resolve(detection.descriptor);
                } else {
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = base64Image;
    });
}

export async function startFaceScanMatch(videoEl, masterAmt, onMatch, onTimeout) {
    if (!modelsLoaded) await loadFaceModels();

    // 1. Prepare labeled descriptors from master data
    const labeledDescriptors = [];
    for (const amt of masterAmt) {
        // Skip mock SVG generated photos
        if (amt.foto && !amt.foto.startsWith('data:image/svg')) {
            const descriptor = await getFaceDescriptorFromBase64(amt.foto);
            if (descriptor) {
                labeledDescriptors.push(
                    new faceapi.LabeledFaceDescriptors(amt.name, [descriptor])
                );
            }
        }
    }

    if (labeledDescriptors.length === 0) {
        onTimeout("Belum ada data foto wajah asli di Master Data. Silakan gunakan No. Telepon.");
        return null;
    }

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55); // 0.55 distance threshold
    let scanInterval;
    let timeoutId;
    let isMatching = false;

    // Start scanning
    scanInterval = setInterval(async () => {
        if (isMatching || videoEl.paused || videoEl.ended) return;
        isMatching = true;
        
        try {
            const detection = await faceapi.detectSingleFace(videoEl).withFaceLandmarks().withFaceDescriptor();
            if (detection) {
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                if (bestMatch.label !== 'unknown') {
                    // Match found!
                    clearInterval(scanInterval);
                    clearTimeout(timeoutId);
                    
                    const matchedAmt = masterAmt.find(a => a.name === bestMatch.label);
                    onMatch(matchedAmt);
                }
            }
        } catch (e) {
            console.error("Error during face detection:", e);
        }
        isMatching = false;
    }, 500); // scan every 500ms

    // Timeout after 10 seconds
    timeoutId = setTimeout(() => {
        clearInterval(scanInterval);
        onTimeout("Wajah tidak dikenali. Silakan coba lagi atau gunakan No. Telepon.");
    }, 10000);

    return () => {
        clearInterval(scanInterval);
        clearTimeout(timeoutId);
    };
}
