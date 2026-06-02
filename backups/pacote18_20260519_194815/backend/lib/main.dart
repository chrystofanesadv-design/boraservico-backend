import 'package:flutter/material.dart';

import 'core/storage.dart';
import 'core/api.dart';
import 'services/socket_service.dart';

import 'auth/login_page.dart';
import 'client/home_client.dart';
import 'professional/home_professional.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: SplashRouter(),
    );
  }
}

class SplashRouter extends StatefulWidget {
  const SplashRouter({super.key});

  @override
  State<SplashRouter> createState() => _SplashRouterState();
}

class _SplashRouterState extends State<SplashRouter> {
  bool loading = true;
  Widget screen = const SizedBox();

  @override
  void initState() {
    super.initState();
    initApp();
  }

  // 🚀 INITIALIZATION FLOW SAFE
  Future<void> initApp() async {
    try {
      await Api.init();

      final token = await Storage.getToken();

      // ❌ SEM TOKEN → LOGIN
      if (token == null || token.isEmpty) {
        if (!mounted) return;

        setState(() {
          loading = false;
          screen = const LoginPage();
        });
        return;
      }

      // 🔐 injeta token na API
      await Api.setToken(token);

      // 🔌 evita múltiplas conexões
      await SocketService.connect();

      // 🧠 FUTURO: vir do JWT
      final isProfessional = await _fakeRoleCheck();

      if (!mounted) return;

      setState(() {
        loading = false;
        screen = isProfessional
            ? const HomeProfessional()
            : const HomeClient();
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        loading = false;
        screen = const LoginPage();
      });
    }
  }

  // 🧠 SIMULA ROLE (trocar por JWT decode depois)
  Future<bool> _fakeRoleCheck() async {
    await Future.delayed(const Duration(milliseconds: 200));
    return true; // PROFESSIONAL default
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : screen,
    );
  }
}