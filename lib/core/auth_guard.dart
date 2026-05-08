import 'dart:convert';
import 'package:jwt_decoder/jwt_decoder.dart';
import 'storage.dart';

class AuthGuard {
  // 🔐 pega role real do token JWT
  static Future<String?> getUserRole() async {
    final token = await Storage.getToken();

    if (token == null || token.isEmpty) return null;

    try {
      Map<String, dynamic> decoded = JwtDecoder.decode(token);

      // backend deve enviar: role no JWT
      return decoded['role'];
    } catch (e) {
      return null;
    }
  }

  // 🔒 valida se token ainda é válido
  static Future<bool> isTokenValid() async {
    final token = await Storage.getToken();

    if (token == null || token.isEmpty) return false;

    return !JwtDecoder.isExpired(token);
  }
}