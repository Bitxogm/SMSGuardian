import { PermissionsAndroid, Platform, Alert } from 'react-native';

export class PermissionsService {
  static async requestSMSPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);
      
      const allGranted = Object.values(granted).every(
        permission => permission === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permisos Requeridos',
          'SMS Guardian necesita permisos de SMS y contactos para funcionar correctamente.',
          [{ text: 'OK' }]
        );
      }

      return allGranted;
    } catch (error) {
      console.error('Error requesting SMS permissions:', error);
      return false;
    }
  }

  static async checkSMSPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      const receiveGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      const readGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
      const contactsGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
      
      return receiveGranted && readGranted && contactsGranted;
    } catch (error) {
      console.error('Error checking SMS permissions:', error);
      return false;
    }
  }

  static async checkContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const result = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS
    );
    return result;
  } catch (error) {
    console.error('Error checking contacts permission:', error);
    return false;
  }
}

static async requestContactsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      {
        title: 'Permisos de Contactos',
        message: 'SMS Guardian necesita acceso a tus contactos para la whitelist',
        buttonNeutral: 'Preguntar después',
        buttonNegative: 'Cancelar',
        buttonPositive: 'Aceptar',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}


}