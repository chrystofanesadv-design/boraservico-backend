import '../core/api.dart';
import '../core/storage.dart';

class AuthService {
  static Future<bool> login(String email, String password) async {
    try {
      final response = await Api.dio.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      // 🔐 compatível com diferentes backends
      final data = response.data;

      final token = data['access_token'] ??
          data['token'] ??
          data['data']?['token'];

      if (token == null) {
        return false;
      }

      // 💾 salva token
      await Storage.saveToken(token);

      // 🔄 reinicializa API com token
      await Api.init();

      return true;
    } catch (e) {
      print('Login error: $e');
      return false;
    }
  }

  static Future<void> logout() async {
    await Storage.clear();
  }
}