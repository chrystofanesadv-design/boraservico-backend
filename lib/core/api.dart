import 'package:dio/dio.dart';
import 'storage.dart';

class Api {
  static final Dio dio = Dio(
    BaseOptions(
      baseUrl: 'http://10.0.2.2:3000', // Android emulator
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );

  static Future<void> init() async {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await Storage.getToken();

          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          return handler.next(options);
        },
      ),
    );
  }
}