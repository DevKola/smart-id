declare module 'react-native-config' {
  interface NativeConfig {
    BACKEND_HOST_IOS: string;
    BACKEND_HOST_ANDROID: string;
    BACKEND_PORT: string;
    WS_PATH: string;
    SCAN_PATH: string;
  }

  const Config: NativeConfig;
  export default Config;
}
