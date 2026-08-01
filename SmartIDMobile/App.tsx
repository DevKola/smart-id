import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {
  Camera,
  CameraRef,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  CommonResolutions,
} from 'react-native-vision-camera';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Camera as CameraIcon, RefreshCcw, SwitchCamera, AlertTriangle } from 'lucide-react-native';
// ─── Backend Configuration ───────────────────────────────────────────────────
// 🔧 LOCAL DEV:  set IS_PRODUCTION = false, use your machine IP on the same WiFi
// 🚀 PRODUCTION: set IS_PRODUCTION = true, then paste your Rwailway URL below
const IS_PRODUCTION = true;

const PRODUCTION_URL = 'smart-id-production.up.railway.app'; 
const LOCAL_HOST     = '192.168.1.7';                  
const LOCAL_PORT     = '8000';

const BACKEND_WS_URL  = IS_PRODUCTION
  ? `wss://${PRODUCTION_URL}/ws/scan`
  : `ws://${LOCAL_HOST}:${LOCAL_PORT}/ws/scan`;

const BACKEND_HTTP_URL = IS_PRODUCTION
  ? `https://${PRODUCTION_URL}/scan/`
  : `http://${LOCAL_HOST}:${LOCAL_PORT}/scan/`;

const BACKEND_ROOT_URL = IS_PRODUCTION
  ? `https://${PRODUCTION_URL}/`
  : `http://${LOCAL_HOST}:${LOCAL_PORT}/`;
// ─────────────────────────────────────────────────────────────────────────────


const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

interface DetectionInfo {
  description: string;
  safety_warning?: string;
}

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DetectedItem {
  label: string;
  confidence: number;
  box: BoundingBox;
}

interface ServerResponse {
  status: string;
  detected?: string;
  information?: string | DetectionInfo;
  message?: string;
  data?: DetectedItem[];
}

export default function App(): React.JSX.Element {
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(cameraPosition);
  const camera = useRef<CameraRef>(null);
  
  // Set resolution to VGA (640x480) because YOLO runs at 640. 
  // High res crashes WebSockets with huge base64 payloads!
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    quality: 0.6,
  });
  
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isLiveScanning, setIsLiveScanning] = useState<boolean>(false);
  const [resultData, setResultData] = useState<ServerResponse | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [snapImageUri, setSnapImageUri] = useState<string | null>(null);
  const [isSnapping, setIsSnapping] = useState<boolean>(false);
  const [isSendingSnap, setIsSendingSnap] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const ws = useRef<WebSocket | null>(null);
  const isScanningRef = useRef(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // WebSocket Connection Management
  useEffect(() => {
    const connectWs = () => {
      const wsUrl = BACKEND_WS_URL;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket Connected');
        setWsConnected(true);
      };

      ws.current.onmessage = (e) => {
        try {
          const data: ServerResponse = JSON.parse(e.data);
          setResultData(data);
          
          // Trigger next frame capture if still live scanning
          if (isScanningRef.current) {
             captureAndSendFrame();
          }
        } catch (err) {
          console.error("Error parsing WS message", err);
        }
      };

      ws.current.onerror = (e) => {
        console.log('WebSocket Error:', e.message);
      };

      ws.current.onclose = () => {
        console.log('WebSocket Disconnected');
        setWsConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- SNAP MODE: Capture a single photo with the device camera ----
  const toggleCameraPosition = () => {
    setCameraPosition((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const snapPhoto = async () => {
    if (!camera.current || !device) return;

    // Stop live scanning if it was running
    setIsLiveScanning(false);
    isScanningRef.current = false;
    setResultData(null);
    setIsSnapping(true);

    try {
      const photo = await photoOutput.capturePhoto({ flashMode: 'off', photoOrientation: 'portrait' }, {});
      const path = await photo.saveToTemporaryFileAsync();
      photo.dispose();

      const uri = path.startsWith('file://')
        ? path
        : `file://${path}`;

      setSnapImageUri(uri);
      await sendSnapToBackend(uri);
    } catch (err) {
      console.log('Snap failed', err);
    } finally {
      setIsSnapping(false);
    }
  };

  // const pickTestImage = async () => {
  //   const result = await launchImageLibrary({
  //     mediaType: 'photo',
  //     quality: 0.8,
  //   });
    
  //   if (result.assets && result.assets.length > 0) {
  //     const uri = result.assets[0].uri;
  //     if (uri) {
  //       setSnapImageUri(uri);
  //       await sendSnapToBackend(uri);
  //     }
  //   }
  // };

  const sendSnapToBackend = async (uri: string) => {
    try {
      setIsSendingSnap(true);
      console.log('Waking up backend server...');
      // First ping the root to wake Render from sleep (free tier cold start)
      try { await fetch(BACKEND_ROOT_URL, { method: 'GET' }); } catch (_) {}

      console.log('Sending snap via HTTP POST...');
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: 'snap_image.jpg',
      } as any);

      const response = await fetch(BACKEND_HTTP_URL, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResultData(data);
    } catch (err) {
      console.log('Failed to send snap over HTTP POST', err);
    } finally {
      setIsSendingSnap(false);
    }
  };

  const clearSnap = () => {
    setSnapImageUri(null);
    setResultData(null);
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    clearSnap();
    setIsLiveScanning(false);
    isScanningRef.current = false;

    // Simulate a brief delay to show the refresh spinner
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  }, []);
  // -------------------------------------------------------------------

  const captureAndSendFrame = async () => {
    if (!camera.current || !ws.current || ws.current.readyState !== WebSocket.OPEN || !isScanningRef.current) {
      return;
    }

    try {
      const photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
      const path = await photo.saveToTemporaryFileAsync();
      photo.dispose();

      // Read photo as blob and convert to Base64
      const fetchUri = path.startsWith('file://') ? path : `file://${path}`;
      const res = await fetch(fetchUri);
      const blob = await res.blob();
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const base64String = base64data.split(',')[1];
        
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(base64String);
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Frame capture error:', error);
      if (isScanningRef.current) {
         setTimeout(captureAndSendFrame, 500);
      }
    }
  };

  const toggleScanning = () => {
    if (snapImageUri) clearSnap(); // Clear snap to resume live AR
    const newState = !isLiveScanning;
    setIsLiveScanning(newState);
    isScanningRef.current = newState;

    if (newState) {
      setResultData(null);
      captureAndSendFrame(); // Start the loop
    }
  };

  useEffect(() => {
    // If we have any resultData from the server, slide up the modal
    if (resultData) {
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [resultData, slideAnim]);

  const closeBottomSheet = () => {
    setResultData(null);
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#a855f7" />
        <Text style={styles.text}>Requesting Camera Hardware Access...</Text>
      </View>
    );
  }

  // No physical camera detected (e.g. simulator)
  if (device == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No Camera Detected on this Device</Text>
        <Text style={styles.subText}>
          A physical device with a camera is required to use Snap mode.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      bounces={true}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh} 
          tintColor="#a855f7" 
          colors={["#a855f7"]}
        />
      }
    >
      {/* Background layer: Either the snapped image OR the live camera feed */}
      {snapImageUri ? (
        <View style={[StyleSheet.absoluteFill, styles.snapImageWrapper]}>
          <Image
            source={{ uri: snapImageUri }}
            style={styles.snapImage}
            resizeMode="contain"
          />
        </View>
      ) : (
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          orientationSource="interface"
          outputs={[photoOutput]}
        />
      )}

      {/* SVG Overlay for Bounding Boxes */}
      {resultData?.data && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {resultData.data.map((item, index) => {
            // Convert normalized coordinates (0.0 to 1.0) to screen pixels
            const x = item.box.x1 * SCREEN_WIDTH;
            const y = item.box.y1 * SCREEN_HEIGHT;
            const width = (item.box.x2 - item.box.x1) * SCREEN_WIDTH;
            const height = (item.box.y2 - item.box.y1) * SCREEN_HEIGHT;

            return (
              <React.Fragment key={index}>
                <Rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  stroke="#a855f7"
                  strokeWidth="3"
                  fill="rgba(168, 85, 247, 0.2)"
                />
                <SvgText
                  x={x}
                  y={y - 10}
                  fill="#a855f7"
                  fontSize="20"
                  fontWeight="bold"
                >
                  {`${item.label} (${Math.round(item.confidence * 100)}%)`}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}

      {isSendingSnap && (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator size="large" color="#a855f7" />
          <Text style={styles.analyzingText}>Analyzing...</Text>
        </View>
      )}

      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>{snapImageUri ? 'SNAP MODE' : 'SMART ID AR'}</Text>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, wsConnected ? styles.statusDotConnected : styles.statusDotDisconnected]} />
          <Text style={styles.statusText}>{wsConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      {!snapImageUri && (
        <TouchableOpacity style={styles.flipButton} onPress={toggleCameraPosition}>
          <SwitchCamera color="#fff" size={24} />
        </TouchableOpacity>
      )}

      <View style={styles.buttonContainer}>
        {/* Upload Photo button — disabled for physical device (emulator testing only) */}
        {/* <TouchableOpacity style={styles.uploadButtonSmall} onPress={pickTestImage}>
          <Text style={styles.uploadButtonTextSmall}>Upload Photo</Text>
        </TouchableOpacity> */}


        {/* Snap Photo button — capture with the device camera (Big Round Button) */}
        <TouchableOpacity
          style={[styles.captureButton, (isSnapping || isSendingSnap) && styles.captureButtonActive]}
          onPress={snapImageUri ? clearSnap : snapPhoto}
          disabled={isSnapping || isLiveScanning || isSendingSnap}
        >
          {isSnapping || isSendingSnap ? (
            <ActivityIndicator size="large" color="#a855f7" />
          ) : snapImageUri ? (
            <RefreshCcw color="#a855f7" size={32} />
          ) : (
            <View style={styles.innerCaptureCircle} />
          )}
        </TouchableOpacity>

        <Text style={styles.instructionText}>
          {isLiveScanning 
            ? 'Live AR Active' 
            : isSendingSnap
              ? 'Analyzing...'
              : snapImageUri 
                ? 'Tap to Retake' 
                : 'Tap to Snap Photo'}
        </Text>
      </View>

      {/* The Animated Bottom Sheet */}
      <Animated.View
        style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.dragHandle} />

        {resultData && resultData.status === 'success' && (
            <View style={styles.sheetContent}>
              {resultData.detected ? (
                <>
                  <Text style={styles.detectedTitle}>
                    {resultData.detected.toUpperCase()}
                  </Text>

                  {typeof resultData.information === 'object' ? (
                    <View style={styles.infoContainer}>
                      {resultData.information.safety_warning && (
                        <View style={styles.warningBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <AlertTriangle color="#b91c1c" size={16} />
                            <Text style={[styles.warningHeading, { marginBottom: 0 }]}>
                              SAFETY PROTOCOL
                            </Text>
                          </View>
                          <Text style={styles.warningText}>
                            {resultData.information.safety_warning}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.descriptionText}>
                        {resultData.information.description}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.descriptionText}>
                      {resultData.information}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.detectedTitle}>NO OBJECT FOUND</Text>
                  <Text style={styles.descriptionText}>
                    The AI couldn't recognize any objects in this photo. Try a different angle or a clearer image.
                  </Text>
                </>
              )}
            </View>
          )}

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={closeBottomSheet}
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  analyzingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  analyzingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
    letterSpacing: 2,
  },
  text: { color: '#f3f4f6', textAlign: 'center', fontSize: 16, marginTop: 15 },
  headerContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 10,
    marginBottom: 8,
  },
  flipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonText: {
    fontSize: 20,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotConnected: {
    backgroundColor: '#22c55e',
  },
  statusDotDisconnected: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    flexDirection: 'column',
    gap: 15,
  },
  subText: {
    color: '#9ca3af',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 40,
  },
  snapImageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  snapImage: {
    width: SCREEN_HEIGHT,  // swap width/height to fill portrait screen after rotation
    height: SCREEN_WIDTH,
    transform: [{ rotate: '90deg' }],
  },
  snapButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  snapButtonActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.5)',
  },
  snapButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  uploadButtonSmall: {
    backgroundColor: 'rgba(168, 85, 247, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 10,
  },
  uploadButtonTextSmall: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  instructionText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  captureButtonActive: {
    borderColor: '#ef4444',
  },
  innerCaptureCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
  innerCaptureCircleActive: {
    backgroundColor: '#ef4444',
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandle: {
    width: 50,
    height: 5,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetContent: { marginBottom: 25 },
  detectedTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 15,
    letterSpacing: 1,
  },
  infoContainer: { gap: 15 },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 15,
    borderRadius: 12,
  },
  warningHeading: {
    fontWeight: '900',
    color: '#b91c1c',
    fontSize: 12,
    marginBottom: 6,
    letterSpacing: 1,
  },
  warningText: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  descriptionText: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
    fontWeight: '500',
  },
  dismissButton: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
