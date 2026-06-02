import 'package:shared_preferences/shared_preferences.dart';

class Storage {
  static const String _tokenKey = 'auth_token';

  // 💾 SALVAR TOKEN
  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
  }

  // 🔐 PEGAR TOKEN
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  // 🧹 LIMPAR TOKEN (LOGOUT)
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }

  // 🚀 VERIFICAR LOGIN
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }
}