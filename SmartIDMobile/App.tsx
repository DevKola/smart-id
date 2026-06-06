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
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';

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
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isLiveScanning, setIsLiveScanning] = useState<boolean>(false);
  const [resultData, setResultData] = useState<ServerResponse | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [testImageUri, setTestImageUri] = useState<string | null>(null);
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
      // Android Emulator uses 10.0.2.2 to point to the host machine's localhost
      const backendHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
      const wsUrl = `ws://${backendHost}:8000/ws/scan`; 
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
  }, []);

  // ---- TEST MODE: IMAGE UPLOAD ----
  const pickTestImage = async () => {
    // Stop live scanning if it was running
    setIsLiveScanning(false);
    isScanningRef.current = false;
    setResultData(null);

    const result = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
    if (result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      if (uri) {
        setTestImageUri(uri);
        sendUriToBackend(uri);
      }
    }
  };

  const sendUriToBackend = async (uri: string) => {
    try {
       console.log('Sending via HTTP POST...');
       const backendHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
       const response = await fetch(`http://${backendHost}:8000/scan/`, {
         method: 'POST',
         body: createFormData(uri)
       });
       const data = await response.json();
       setResultData(data);
    } catch (err) {
      console.log('Failed to send test image', err);
    }
  };

  const createFormData = (uri: string) => {
    const data = new FormData();
    data.append('file', {
      uri: uri,
      type: 'image/jpeg',
      name: 'test_image.jpg',
    } as any);
    return data;
  };

  const clearTestImage = () => {
    setTestImageUri(null);
    setResultData(null);
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Reset all states
    clearTestImage();
    setIsLiveScanning(false);
    isScanningRef.current = false;
    
    // Simulate a brief delay to show the refresh spinner
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  }, []);
  // ---------------------------------

  const captureAndSendFrame = async () => {
    if (!camera.current || !ws.current || ws.current.readyState !== WebSocket.OPEN || !isScanningRef.current) {
      return;
    }

    try {
      const photo = await camera.current.takePhoto({
        qualityPrioritization: 'speed',
        flash: 'off',
      });

      // Read photo as blob and convert to Base64
      const fetchUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
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
    if (testImageUri) clearTestImage(); // Clear test image to resume live AR
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

  // If no device AND no test image is picked, show the test mode screen
  if (device == null && !testImageUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No Camera Detected on Simulator</Text>
        <TouchableOpacity style={styles.uploadButton} onPress={pickTestImage}>
          <Text style={styles.uploadButtonText}>Upload Image to Test AI</Text>
        </TouchableOpacity>
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
      {/* Background layer: Either the test image OR the live camera feed */}
      {testImageUri ? (
        <Image source={{ uri: testImageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : (
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device!}
          isActive={true}
          photo={true}
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

      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>{testImageUri ? "TEST MODE" : "SMART ID AR"}</Text>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: wsConnected ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>{wsConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
         <TouchableOpacity style={styles.uploadButtonSmall} onPress={pickTestImage}>
          <Text style={styles.uploadButtonTextSmall}>Upload Photo</Text>
        </TouchableOpacity>

        {/* Hide live scan button if on simulator and no camera exists */}
        {device && (
          <TouchableOpacity
            style={[styles.captureButton, isLiveScanning && styles.captureButtonActive]}
            onPress={toggleScanning}
            disabled={!wsConnected && !testImageUri}
          >
            <View style={[styles.innerCaptureCircle, isLiveScanning && styles.innerCaptureCircleActive]} />
          </TouchableOpacity>
        )}
        
        {device && (
          <Text style={styles.instructionText}>
            {isLiveScanning ? 'Tap to Stop Live AR' : 'Tap to Start Live AR'}
          </Text>
        )}
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
                          <Text style={styles.warningHeading}>
                            ⚠️ SAFETY PROTOCOL
                          </Text>
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
  uploadButton: {
    backgroundColor: '#a855f7',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    marginTop: 20,
    alignSelf: 'center',
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  uploadButtonSmall: {
    backgroundColor: 'rgba(168, 85, 247, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
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
