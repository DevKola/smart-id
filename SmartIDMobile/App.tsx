import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

interface DetectionInfo {
  description: string;
  safety_warning?: string;
}

interface ServerResponse {
  status: string;
  detected?: string;
  information?: string | DetectionInfo;
  message?: string;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function App(): React.JSX.Element {
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [resultData, setResultData] = useState<ServerResponse | null>(null);

  // The Animation Engine
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Triggers the slide animation whenever resultData changes
  useEffect(() => {
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

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#a855f7" />
        <Text style={styles.text}>Requesting Camera Hardware Access...</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No Virtual Camera Detected on Emulator</Text>
      </View>
    );
  }

  const handleCapture = async () => {
    if (camera.current && !isScanning) {
      setIsScanning(true);
      setResultData(null);

      try {
        const photo = await camera.current.takePhoto({
          qualityPrioritization: 'speed',
        });

        const serverUrl = 'http://10.0.2.2:8000/scan/';

        const formData = new FormData();
        formData.append('file', {
          uri: `file://${photo.path}`,
          type: 'image/jpeg',
          name: 'capture.jpg',
        } as any);

        const response = await fetch(serverUrl, {
          method: 'POST',
          body: formData,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'multipart/form-data',
          },
        });

        if (!response.ok) {
          throw new Error(`Server connection failed: ${response.status}`);
        }

        const data: ServerResponse = await response.json();
        setResultData(data);
      } catch (error) {
        console.error('Transmission Error:', error);
        Alert.alert(
          'Network Failure',
          'Could not reach the Python server. Is FastAPI running?',
        );
      } finally {
        setIsScanning(false);
      }
    }
  };

  const closeBottomSheet = () => {
    setResultData(null); // This triggers the slide-down animation
  };

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!resultData} // Pauses camera behind the sheet to save memory
        photo={true}
      />

      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>SMART ID</Text>
      </View>

      {isScanning && (
        <View style={styles.scanningOverlay}>
          <View style={styles.scanBox}>
            <ActivityIndicator size="large" color="#a855f7" />
            <Text style={styles.scanningText}>Running AI Model...</Text>
          </View>
        </View>
      )}

      {!resultData && !isScanning && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
          >
            <View style={styles.innerCaptureCircle} />
          </TouchableOpacity>
        </View>
      )}

      {/* The Animated Bottom Sheet */}
      <Animated.View
        style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={styles.dragHandle} />

        {resultData &&
          resultData.status === 'success' &&
          resultData.detected && (
            <View style={styles.sheetContent}>
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
            </View>
          )}

        {resultData && resultData.message === 'No items recognized' && (
          <View style={styles.sheetContent}>
            <Text style={styles.detectedTitle}>NO MATCH</Text>
            <Text style={styles.descriptionText}>
              No matching objects found in the YOLOv8 database. Please try
              another item or adjust the lighting.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.dismissButton}
          onPress={closeBottomSheet}
        >
          <Text style={styles.dismissButtonText}>Scan Another Item</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
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
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
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
  innerCaptureCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    backgroundColor: '#ffffff',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  scanningText: {
    color: '#111827',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '800',
  },

  // Bottom Sheet Styles
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
