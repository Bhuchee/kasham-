import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    ScrollView,
    Modal,
    Linking,
    StyleSheet,
    Image,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronRight,
    ArrowLeft,
    Lock,
    Store,
    Eye,
    EyeOff,
    ShieldCheck,
    CheckCircle,
    Wallet,
    Package,
    X,
    Mail,
    User,
    Sparkles,
    CheckSquare,
} from 'lucide-react-native';
import CountryPicker, { CountryCode } from 'react-native-country-picker-modal';
import { saveCountryCode } from '../hooks/useCurrency';
import AppModal from '../components/AppModal';
import { ChevronLeft } from 'lucide-react-native';

WebBrowser.maybeCompleteAuthSession();

type Step = 'welcome' | 'login' | 'signup_step1' | 'verify_email' | 'signup_step2' | 'reset_password';

const BUSINESS_TYPES = [
    'Provision Store',
    'Supermarket Minimart',
    'Pharmacy',
    'Food Vendor',
    'Boutique Clothing Store',
    'Electronics Phone Accessories',
    'Other',
];

const WALKTHROUGH_SLIDES = [
    {
        title: 'Stop losing your money to memory',
        description:
            'Every day, little sales slip away because you forgot to write them down. Chobo tracks every single Cedi and Naira instantly, so you go home knowing your exact profit.',
        icon: Wallet,
    },
    {
        title: "Never tell a customer \"It's finished\"",
        description:
            'Turning a customer away is like throwing away money. Chobo alerts you before your fastest-moving items run empty, keeping your shelves full and your shop busy.',
        icon: Package,
    },
    {
        title: 'Get paid back without the awkward talks',
        description:
            'Chasing customer debts feels stressful and awkward. Chobo keeps accurate, indisputable records of who owes you and lets you send polite, friendly reminders with one tap.',
        icon: ShieldCheck,
    },
];

interface LoginScreenProps {
    resetToken?: string | null;
    onClearResetToken?: () => void;
}

const GoogleIcon = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

export default function LoginScreen({ resetToken, onClearResetToken }: LoginScreenProps) {
    const [step, setStep] = useState<Step>('welcome');

    // Auth inputs
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
    const [otherBusinessType, setOtherBusinessType] = useState('');
    const [countryCode, setCountryCode] = useState<CountryCode>('NG');
    const [callingCode, setCallingCode] = useState('234');
    const [tosAccepted, setTosAccepted] = useState(false);

    // Eye toggles
    const [showPassword, setShowPassword] = useState(false);

    // OTP State
    const [otpCode, setOtpCode] = useState('');
    const [countdown, setCountdown] = useState(60);
    const [verifyEmailAddress, setVerifyEmailAddress] = useState('');
    const [resendStatus, setResendStatus] = useState('');

    // Reset Password inputs
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Temp Auth Data (holds verified token + user ID to use in step 2 before completing signup)
    const [tempAuthData, setTempAuthData] = useState<any>(null);

    // UI states
    const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [signupError, setSignupError] = useState('');
    const [resetError, setResetError] = useState('');

    // Inline Auth Error States
    const [loginEmailError, setLoginEmailError] = useState('');
    const [loginPasswordError, setLoginPasswordError] = useState('');
    const [signupNameError, setSignupNameError] = useState('');
    const [signupEmailError, setSignupEmailError] = useState('');
    const [signupPasswordError, setSignupPasswordError] = useState('');

    // Walkthrough states
    const [showSplash, setShowSplash] = useState(true);
    const [showWalkthrough, setShowWalkthrough] = useState(false);
    const [walkthroughPage, setWalkthroughPage] = useState(0);

    // Dropdown/Preseter states
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

    // Forgot Password States
    const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotError, setForgotError] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);

    // Custom AppModal State
    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        type: 'success' | 'error' | 'warning' | 'info';
        title: string;
        subtitle?: string;
    }>({
        visible: false,
        type: 'info',
        title: '',
    });

    const { login } = useAuthStore();
    const insets = useSafeAreaInsets();

    // Password validation rules
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const isPasswordValid = hasLength && hasUpper && hasNumber && hasSpecial;

    // Reset password validation
    const hasResetLength = newPassword.length >= 8;
    const hasResetUpper = /[A-Z]/.test(newPassword);
    const hasResetNumber = /[0-9]/.test(newPassword);
    const hasResetSpecial = /[^A-Za-z0-9]/.test(newPassword);
    const isResetPasswordValid = hasResetLength && hasResetUpper && hasResetNumber && hasResetSpecial;

    // JS Splash timeout — minimum 2 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowSplash(false);
            setShowWalkthrough(true);
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    // OTP Countdown Timer
    useEffect(() => {
        if (step !== 'verify_email') return;
        if (countdown <= 0) return;
        const timer = setInterval(() => {
            setCountdown((c) => c - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown, step]);

    // Handle deep linked resetToken
    useEffect(() => {
        if (resetToken) {
            setStep('reset_password');
        }
    }, [resetToken]);

    // Google OAuth setup
    const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'chobo',
        path: 'oauthredirect',
    });

    const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });

    useEffect(() => {
        if (googleResponse?.type === 'success') {
            const idToken = googleResponse.authentication?.idToken;
            if (!idToken) {
                setModalConfig({
                    visible: true,
                    type: 'error',
                    title: 'Google sign-in failed',
                    subtitle: 'Could not get authentication token. Please try again.',
                });
                return;
            }
            handleGoogleAuth(idToken);
        }
    }, [googleResponse]);

    const handleGoogleAuth = async (idToken: string) => {
        setLoading(true);
        setLoginError('');
        setSignupError('');
        try {
            const res = await fetch(`${API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: idToken }),
            });
            const data = await res.json();
            if (res.ok) {
                if (data.isNewUser) {
                    setTempAuthData(data);
                    setStep('signup_step2');
                } else {
                    const workspacesMapped = (data.workspaces || []).map((w: any) => ({
                        ownerId: w.workspaceId,
                        shopName: w.name,
                        role: w.role,
                        status: w.status,
                        tier: w.tier,
                    }));
                    await saveCountryCode(data.country_code || 'NG');
                    await login(data.access_token, data.refresh_token, data.user_id, data.businessName, workspacesMapped);
                }
            } else {
                setModalConfig({
                    visible: true,
                    type: 'error',
                    title: 'Google sign-in failed',
                    subtitle: 'Please try again or use email instead',
                });
            }
        } catch (e) {
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Google sign-in failed',
                subtitle: 'Please try again or use email instead',
            });
        } finally {
            setLoading(false);
        }
    };

    const validateEmail = (val: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val.trim() || !emailRegex.test(val.trim())) {
            setLoginEmailError('Enter a valid email address');
            return false;
        }
        setLoginEmailError('');
        return true;
    };

    const validatePassword = (val: string) => {
        if (!val.trim()) {
            setLoginPasswordError('Password is required');
            return false;
        }
        setLoginPasswordError('');
        return true;
    };

    const validateSignupName = (val: string) => {
        if (!val.trim()) {
            setSignupNameError('Full name is required');
            return false;
        }
        setSignupNameError('');
        return true;
    };

    const validateSignupEmail = (val: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val.trim() || !emailRegex.test(val.trim())) {
            setSignupEmailError('Enter a valid email address');
            return false;
        }
        setSignupEmailError('');
        return true;
    };

    const validateSignupPassword = (val: string) => {
        if (!val.trim()) {
            setSignupPasswordError('Password is required');
            return false;
        }
        if (!isPasswordValid) {
            setSignupPasswordError('Password does not meet requirements');
            return false;
        }
        setSignupPasswordError('');
        return true;
    };

    // ── Login Action ─────────────────────────────────────────────────────────
    const handleLogin = async () => {
        setLoginEmailError('');
        setLoginPasswordError('');

        const isEmailValid = validateEmail(email);
        const isPassValid = validatePassword(password);

        if (!isEmailValid || !isPassValid) {
            return;
        }

        setLoading(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
                signal: controller.signal,
            });
            const data = await res.json();

            if (res.status === 403) {
                setVerifyEmailAddress(email.toLowerCase().trim());
                setCountdown(60);
                setStep('verify_email');
            } else if (res.ok && data.access_token) {
                const workspacesMapped = (data.workspaces || []).map((w: any) => ({
                    ownerId: w.workspaceId,
                    shopName: w.name,
                    role: w.role,
                    status: w.status,
                    tier: w.tier,
                }));
                await saveCountryCode(data.country_code || countryCode);
                await login(data.access_token, data.refresh_token, data.user_id, data.businessName, workspacesMapped);
            } else {
                setLoginPasswordError('Incorrect email or password');
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') {
                setLoginPasswordError('Server is waking up — please try again in a moment.');
            } else {
                setLoginPasswordError('Could not reach the server. Please check your connection.');
            }
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    };

    // ── Signup Step 1 Action ──────────────────────────────────────────────────
    const handleSignupStep1 = async () => {
        setSignupError('');
        setSignupNameError('');
        setSignupEmailError('');
        setSignupPasswordError('');

        const isNameValid = validateSignupName(name);
        const isEmailValid = validateSignupEmail(email);
        const isPassValid = validateSignupPassword(password);

        if (!isNameValid || !isEmailValid || !isPassValid) {
            return;
        }
        if (!tosAccepted) {
            setSignupError('You must accept the terms to create an account');
            return;
        }

        setLoading(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.toLowerCase().trim(),
                    password,
                    name: name.trim(),
                    country_code: countryCode,
                    tos_accepted: tosAccepted,
                    business_name: `${name.trim()}'s Store`,
                    business_type: 'Other',
                }),
                signal: controller.signal,
            });
            const data = await res.json();

            if (res.ok) {
                setVerifyEmailAddress(email.toLowerCase().trim());
                setCountdown(60);
                setOtpCode('');
                setStep('verify_email');
                setModalConfig({
                    visible: true,
                    type: 'success',
                    title: 'Verification Code Sent',
                    subtitle: 'A 6-digit verification code has been sent to your email.',
                });
            } else {
                setSignupError(data.message || 'Registration failed');
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') {
                setSignupError('Server is waking up — please try again in a moment.');
            } else {
                setSignupError('Could not reach the server. Please check your connection.');
            }
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    };

    // ── Verify OTP Action ─────────────────────────────────────────────────────
    const handleVerifyOtp = async (code: string) => {
        setLoading(true);
        setSignupError('');
        try {
            const res = await fetch(`${API_URL}/auth/verify-email-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: verifyEmailAddress, code }),
            });
            const data = await res.json();

            if (res.ok) {
                // Email verified! Auto login using password from state
                const loginRes = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: verifyEmailAddress, password }),
                });
                const loginData = await loginRes.json();
                if (loginRes.ok) {
                    setTempAuthData(loginData);
                    setStep('signup_step2');
                } else {
                    setModalConfig({
                        visible: true,
                        type: 'success',
                        title: 'Email Verified',
                        subtitle: 'Please log in with your credentials to set up your business details.',
                    });
                    setStep('login');
                }
            } else {
                setSignupError(data.message || 'OTP verification failed.');
            }
        } catch (e) {
            setSignupError('Could not reach the server. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    // ── Resend Verification OTP ───────────────────────────────────────────────
    const handleResendOtp = async () => {
        setResendStatus('');
        try {
            const res = await fetch(`${API_URL}/auth/resend-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: verifyEmailAddress }),
            });
            const data = await res.json();
            if (res.ok) {
                setCountdown(60);
                setOtpCode('');
                setResendStatus('Verification code resent successfully!');
            } else {
                setResendStatus(data.message || 'Failed to resend code.');
            }
        } catch (e) {
            setResendStatus('Connection error. Check your network.');
        }
    };

    // ── Complete Setup (Step 2) Action ────────────────────────────────────────
    const handleCompleteSetup = async () => {
        setSignupError('');
        if (!businessName.trim()) {
            setSignupError('Business Name is required');
            return;
        }

        const finalType = businessType === 'Other' ? otherBusinessType : businessType;
        if (!finalType.trim()) {
            setSignupError('Please specify your business type');
            return;
        }

        setLoading(true);
        try {
            const activeWorkspaceId = tempAuthData.workspaces[0]?.workspaceId;
            const res = await fetch(`${API_URL}/workspaces/${activeWorkspaceId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tempAuthData.access_token}`,
                    'x-workspace-id': activeWorkspaceId,
                },
                body: JSON.stringify({
                    name: businessName.trim(),
                    business_type: finalType,
                }),
            });

            if (res.ok) {
                const workspacesMapped = (tempAuthData.workspaces || []).map((w: any) => ({
                    ownerId: w.workspaceId,
                    shopName: w.workspaceId === activeWorkspaceId ? businessName.trim() : w.name,
                    role: w.role,
                    status: w.status,
                    tier: w.tier,
                }));
                await saveCountryCode(tempAuthData.country_code || countryCode);
                await login(
                    tempAuthData.access_token,
                    tempAuthData.refresh_token,
                    tempAuthData.user_id,
                    businessName.trim(),
                    workspacesMapped
                );
            } else {
                setSignupError('Failed to save store details. Please try again.');
            }
        } catch (e) {
            setSignupError('Network error while completing setup.');
        } finally {
            setLoading(false);
        }
    };

    // ── Reset Password Action ─────────────────────────────────────────────────
    const handleResetPassword = async () => {
        setResetError('');
        if (!newPassword.trim()) {
            setResetError('Please enter a new password');
            return;
        }
        if (!isResetPasswordValid) {
            setResetError('Password does not meet complexity requirements');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, new_password: newPassword }),
            });
            const data = await res.json();
            if (res.ok) {
                setModalConfig({
                    visible: true,
                    type: 'success',
                    title: 'Password Updated',
                    subtitle: 'Your password has been reset successfully. You can now log in.',
                });
                onClearResetToken?.();
                setStep('login');
            } else {
                setResetError(data.message || 'Failed to reset password.');
            }
        } catch (e) {
            setResetError('Connection error. Could not reset password.');
        } finally {
            setLoading(false);
        }
    };

    // ── Forgot Password Action ────────────────────────────────────────────────
    const handleForgotPassword = async () => {
        setForgotError('');
        if (!forgotEmail.trim()) {
            setForgotError('Please enter your email address');
            return;
        }

        setForgotLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail.toLowerCase().trim() }),
            });
            if (res.ok) {
                setModalConfig({
                    visible: true,
                    type: 'success',
                    title: 'Email Sent',
                    subtitle: 'If an account exists, a password reset link has been sent to your email.',
                });
                setForgotPasswordVisible(false);
                setForgotEmail('');
            } else {
                const data = await res.json();
                setForgotError(data.message || 'Failed to send reset link');
            }
        } catch (e) {
            setForgotError('Connection error. Try again.');
        } finally {
            setForgotLoading(false);
        }
    };

    const renderWelcome = () => (
        <View className="flex-1 bg-white" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {/* Green logo card at the top */}
            <View
                style={{
                    marginHorizontal: 24,
                    marginTop: 32,
                    marginBottom: 28,
                    borderRadius: 28,
                    backgroundColor: '#16A34A',
                    paddingVertical: 40,
                    alignItems: 'center',
                    overflow: 'hidden',
                }}
            >
                {/* Decorative circles — same green pattern as before */}
                <View style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.07)' }} />
                <View style={{ position: 'absolute', bottom: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.06)' }} />
                <View style={{ position: 'absolute', top: 20, right: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <Image
                    source={require('../../assets/logo-white.png')}
                    style={{ width: 240, height: 110, resizeMode: 'contain' }}
                />
                <Text
                    style={{ color: 'white', fontWeight: 'bold', marginTop: 10, textTransform: 'uppercase', fontSize: 13, opacity: 0.85, letterSpacing: 2 }}
                >
                    Sell. Track. Grow.
                </Text>
            </View>

            {/* Bottom content on white */}
            <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 8 }}>
                <View>
                    <Text
                        style={{ fontSize: 24, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 8 }}
                    >
                        Welcome to Chobo
                    </Text>
                    <Text
                        style={{ fontSize: 14, lineHeight: 22, color: '#64748B', textAlign: 'center' }}
                    >
                        Your digital record book for selling, tracking stock, and growing your business.
                    </Text>
                </View>

                <View style={{ gap: 12, marginTop: 24 }}>
                    <TouchableOpacity
                        onPress={() => setStep('signup_step1')}
                        style={{ width: '100%', height: 52, backgroundColor: '#16A34A', borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}
                    >
                        <Mail size={20} color="white" />
                        <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Continue with Email</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => googlePromptAsync()}
                        disabled={!googleRequest || loading}
                        style={{ width: '100%', height: 52, backgroundColor: 'white', borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, borderWidth: 1.5, borderColor: '#E5E7EB' }}
                    >
                        <GoogleIcon size={20} />
                        <Text style={{ color: '#0F172A', fontWeight: '700', fontSize: 16 }}>Continue with Google</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ alignItems: 'center', marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setStep('login')} style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, color: '#64748B' }}>
                            Already have an account? <Text style={{ color: '#16A34A', fontWeight: 'bold' }}>Log in</Text>
                        </Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
                        By continuing, you agree to our{' '}
                        <Text style={{ textDecorationLine: 'underline' }}>Terms of Service</Text> and{' '}
                        <Text style={{ textDecorationLine: 'underline' }}>Privacy Policy</Text>
                    </Text>
                </View>
            </View>
        </View>
    );

    const renderLogin = () => (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: '#F8FAFC' }}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity
                    onPress={() => setStep('welcome')}
                    className="w-10 h-10 bg-white items-center justify-center rounded-full mb-8 shadow-sm"
                >
                    <ArrowLeft size={20} color="#0F172A" />
                </TouchableOpacity>
                <Text className="text-3xl font-black text-textPrimary mb-2">Welcome Back</Text>
                <Text className="text-textSecondary font-bold mb-8">Enter your details to access your store.</Text>

                <View className="mb-5">
                    <Text className="text-textSecondary text-xs font-black uppercase mb-2">Email Address</Text>
                    <View className="flex-row items-center bg-white border border-border rounded-xl px-4 h-14 shadow-sm">
                        <Mail size={20} color="#94A3B8" className="mr-3" />
                        <TextInput
                            className="flex-1 font-bold text-base text-textPrimary"
                            placeholder="e.g. name@company.com"
                            placeholderTextColor="#94A3B8"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={(t) => {
                                setEmail(t);
                                setLoginEmailError('');
                            }}
                            onBlur={() => validateEmail(email)}
                        />
                    </View>
                    {loginEmailError ? (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{loginEmailError}</Text>
                    ) : null}
                </View>

                <View className="mb-4">
                    <Text className="text-textSecondary text-xs font-black uppercase mb-2">Password</Text>
                    <View className="flex-row items-center bg-white border border-border rounded-xl px-4 h-14 shadow-sm">
                        <Lock size={20} color="#94A3B8" className="mr-3" />
                        <TextInput
                            className="flex-1 font-bold text-base text-textPrimary"
                            placeholder="Enter password"
                            placeholderTextColor="#94A3B8"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={(t) => {
                                setPassword(t);
                                setLoginPasswordError('');
                            }}
                            onBlur={() => validatePassword(password)}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff size={20} color="#94A3B8" /> : <Eye size={20} color="#94A3B8" />}
                        </TouchableOpacity>
                    </View>
                    {loginPasswordError ? (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{loginPasswordError}</Text>
                    ) : null}
                </View>

                <TouchableOpacity onPress={() => setForgotPasswordVisible(true)} className="align-self-end mb-8">
                    <Text className="text-primary font-bold text-sm text-right">Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleLogin}
                    disabled={loading || !email.trim() || !password.trim()}
                    className={`w-full h-14 rounded-xl items-center justify-center shadow-lg shadow-primary/20 mb-6 ${
                        loading || !email.trim() || !password.trim() ? 'bg-primary/50' : 'bg-primary'
                    }`}
                >
                    {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg">Log In</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => googlePromptAsync()}
                    disabled={!googleRequest || loading}
                    className="w-full h-14 bg-white border border-border rounded-xl items-center justify-center flex-row shadow-sm"
                    style={{ gap: 12 }}
                >
                    <GoogleIcon size={20} />
                    <Text className="text-textPrimary font-bold text-base">Continue with Google</Text>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', marginTop: 24 }}>
                    <TouchableOpacity onPress={() => setStep('signup_step1')}>
                        <Text style={{ fontSize: 14, color: '#64748B' }}>
                            Don't have an account? <Text style={{ color: '#16A34A', fontWeight: 'bold' }}>Sign up</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderSignupStep1 = () => (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        >
            <ScrollView 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 32 }}
            >
                <TouchableOpacity
                    onPress={() => setStep('welcome')}
                    className="w-10 h-10 items-center justify-center -ml-2 mb-6"
                >
                    <ChevronLeft size={28} color="#0F172A" />
                </TouchableOpacity>

                <Text className="text-[#0F172A] mb-2" style={{ fontFamily: 'Poppins-Bold', fontSize: 28 }}>Create your account</Text>
                <Text className="text-[#64748B] mb-8" style={{ fontSize: 14 }}>Start managing your shop smarter.</Text>

                {/* Name */}
                <View className="mb-5">
                    <Text className="text-[#0F172A] font-semibold mb-[6px]" style={{ fontSize: 13 }}>Full name</Text>
                    <TextInput
                        className={`w-full h-[52px] bg-white border rounded-xl px-4 text-[#0F172A] text-[15px] ${signupNameError ? 'border-red-500' : 'border-border focus:border-primary'}`}
                        placeholder="Your full name"
                        placeholderTextColor="#94A3B8"
                        value={name}
                        onChangeText={(t) => {
                            setName(t);
                            setSignupNameError('');
                        }}
                        onBlur={() => validateSignupName(name)}
                    />
                    {signupNameError ? (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{signupNameError}</Text>
                    ) : null}
                </View>

                {/* Email */}
                <View className="mb-5">
                    <Text className="text-[#0F172A] font-semibold mb-[6px]" style={{ fontSize: 13 }}>Email address</Text>
                    <TextInput
                        className={`w-full h-[52px] bg-white border rounded-xl px-4 text-[#0F172A] text-[15px] ${signupEmailError ? 'border-red-500' : 'border-border focus:border-primary'}`}
                        placeholder="you@email.com"
                        placeholderTextColor="#94A3B8"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={(t) => {
                            setEmail(t);
                            setSignupEmailError('');
                        }}
                        onBlur={() => validateSignupEmail(email)}
                    />
                    {signupEmailError ? (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{signupEmailError}</Text>
                    ) : null}
                </View>

                {/* Country Picker */}
                <View className="mb-5">
                    <Text className="text-[#0F172A] font-semibold mb-[6px]" style={{ fontSize: 13 }}>Country</Text>
                    <View className="w-full h-[52px] bg-white border border-border rounded-xl px-4 flex-row items-center focus:border-primary">
                        <CountryPicker
                            withFilter
                            withCallingCode
                            withAlphaFilter
                            countryCode={countryCode}
                            onSelect={(country) => {
                                setCountryCode(country.cca2);
                                setCallingCode(country.callingCode[0]);
                            }}
                        />
                        <Text className="text-[#0F172A] text-[15px] ml-2">
                            {countryCode === 'NG' ? 'Nigeria' : countryCode === 'GH' ? 'Ghana' : 'Other'}
                        </Text>
                    </View>
                </View>

                {/* Password */}
                <View className="mb-6">
                    <Text className="text-[#0F172A] font-semibold mb-[6px]" style={{ fontSize: 13 }}>Password</Text>
                    <View className={`w-full h-[52px] bg-white border rounded-xl px-4 flex-row items-center ${signupPasswordError ? 'border-red-500' : 'border-border focus:border-primary'}`}>
                        <TextInput
                            className="flex-1 text-[#0F172A] text-[15px]"
                            placeholder="Create a password"
                            placeholderTextColor="#94A3B8"
                            secureTextEntry={!showPassword}
                            value={password}
                            onChangeText={(t) => {
                                setPassword(t);
                                setSignupPasswordError('');
                            }}
                            onBlur={() => validateSignupPassword(password)}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff size={20} color="#94A3B8" /> : <Eye size={20} color="#94A3B8" />}
                        </TouchableOpacity>
                    </View>
                    {signupPasswordError ? (
                        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{signupPasswordError}</Text>
                    ) : null}

                    {/* Password Strength Checklist */}
                    {password.length > 0 && (
                        <View className="mt-3">
                            <View className="flex-row items-center mb-1">
                                <CheckCircle size={14} color={hasLength ? '#16A34A' : '#94A3B8'} />
                                <Text className={`text-xs ml-2 font-semibold ${hasLength ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                                    At least 8 characters
                                </Text>
                            </View>
                            <View className="flex-row items-center mb-1">
                                <CheckCircle size={14} color={hasUpper ? '#16A34A' : '#94A3B8'} />
                                <Text className={`text-xs ml-2 font-semibold ${hasUpper ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                                    At least 1 uppercase letter
                                </Text>
                            </View>
                            <View className="flex-row items-center mb-1">
                                <CheckCircle size={14} color={hasNumber ? '#16A34A' : '#94A3B8'} />
                                <Text className={`text-xs ml-2 font-semibold ${hasNumber ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                                    At least 1 number
                                </Text>
                            </View>
                            <View className="flex-row items-center">
                                <CheckCircle size={14} color={hasSpecial ? '#16A34A' : '#94A3B8'} />
                                <Text className={`text-xs ml-2 font-semibold ${hasSpecial ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                                    At least 1 special character
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Terms of Service Checkbox */}
                <TouchableOpacity
                    className="flex-row items-start mb-6 pr-4"
                    onPress={() => setTosAccepted(!tosAccepted)}
                >
                    <View className={`w-5 h-5 rounded border items-center justify-center mr-3 mt-0.5 ${tosAccepted ? 'bg-[#16A34A] border-[#16A34A]' : 'border-[#94A3B8]'}`}>
                        {tosAccepted && <CheckSquare size={14} color="white" />}
                    </View>
                    <Text className="text-[#64748B] text-xs leading-5">
                        By creating an account, you agree to our{' '}
                        <Text className="text-[#16A34A] font-bold">Terms of Service</Text>{' '}
                        and{' '}
                        <Text className="text-[#16A34A] font-bold">Privacy Policy</Text>.
                    </Text>
                </TouchableOpacity>

                {signupError ? <Text className="text-red-500 font-bold text-xs mb-4 text-center">{signupError}</Text> : null}

                {/* Submit button */}
                <TouchableOpacity
                    onPress={handleSignupStep1}
                    disabled={loading || !name.trim() || !email.trim() || !password.trim() || !isPasswordValid || !tosAccepted}
                    className={`w-full h-[52px] rounded-xl items-center justify-center mb-6 ${
                        loading || !name.trim() || !email.trim() || !password.trim() || !isPasswordValid || !tosAccepted ? 'bg-[#E5E7EB]' : 'bg-[#16A34A]'
                    }`}
                >
                    {loading ? <ActivityIndicator color={loading || !name.trim() || !email.trim() || !password.trim() || !isPasswordValid || !tosAccepted ? "#94A3B8" : "white"} /> : 
                    <Text className={`font-semibold text-[15px] ${loading || !name.trim() || !email.trim() || !password.trim() || !isPasswordValid || !tosAccepted ? 'text-[#94A3B8]' : 'text-white'}`}>Create account</Text>}
                </TouchableOpacity>

                {/* Divider */}
                <View className="flex-row items-center mb-6">
                    <View className="flex-1 h-[1px] bg-[#E5E7EB]" />
                    <Text className="mx-4 text-[#94A3B8] text-[12px]">OR</Text>
                    <View className="flex-1 h-[1px] bg-[#E5E7EB]" />
                </View>

                {/* Google Button */}
                <TouchableOpacity
                    onPress={() => googlePromptAsync()}
                    disabled={!googleRequest || loading}
                    className="w-full h-[52px] bg-white border border-[#E5E7EB] rounded-xl items-center justify-center flex-row shadow-sm mb-8"
                >
                    <GoogleIcon size={20} />
                    <Text className="text-[#0F172A] font-bold text-[15px] ml-3">Continue with Google</Text>
                </TouchableOpacity>

                {/* Footer */}
                <View className="items-center">
                    <TouchableOpacity onPress={() => setStep('login')} className="mb-2">
                        <Text style={{ fontSize: 14, color: '#64748B' }}>
                            Already have an account? <Text style={{ color: '#16A34A', fontWeight: 'bold' }}>Log in</Text>
                        </Text>
                    </TouchableOpacity>

                    <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
                        By signing up you agree to our{' '}
                        <Text style={{ textDecorationLine: 'underline' }}>Terms</Text> and{' '}
                        <Text style={{ textDecorationLine: 'underline' }}>Privacy Policy</Text>
                    </Text>
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderVerifyEmail = () => {
        const boxes = [];
        for (let i = 0; i < 6; i++) {
            const char = otpCode[i] || '';
            const isFocused = otpCode.length === i;
            boxes.push(
                <View
                    key={i}
                    className={`w-12 h-14 bg-white border-2 rounded-xl items-center justify-center ${
                        isFocused ? 'border-primary' : 'border-border'
                    }`}
                >
                    <Text className="text-xl font-bold text-textPrimary">{char}</Text>
                </View>
            );
        }

        return (
            <View className="flex-1 bg-lightBackground px-6 justify-center items-center">
                <View className="w-20 h-20 bg-green-50 rounded-full items-center justify-center mb-8">
                    <Mail size={40} color="#16A34A" />
                </View>
                <Text className="text-2xl font-black text-textPrimary text-center mb-3">Verify Your Email</Text>
                <Text className="text-textSecondary font-bold text-center mb-8 max-w-[280px]">
                    Enter the 6-digit verification code sent to <Text className="text-textPrimary">{verifyEmailAddress}</Text>
                </Text>

                {/* OTP Boxes Grid */}
                <View className="relative w-full items-center mb-8">
                    <View className="flex-row justify-center gap-2">{boxes}</View>
                    <TextInput
                        style={StyleSheet.absoluteFill}
                        value={otpCode}
                        onChangeText={(t) => {
                            const clean = t.replace(/[^0-9]/g, '').slice(0, 6);
                            setOtpCode(clean);
                            if (clean.length === 6) {
                                handleVerifyOtp(clean);
                            }
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        caretHidden
                    />
                </View>

                {countdown > 0 ? (
                    <Text className="text-textSecondary font-bold text-sm mb-6">
                        Resend code in <Text className="text-primary font-black">{countdown}s</Text>
                    </Text>
                ) : (
                    <TouchableOpacity onPress={handleResendOtp} className="mb-6">
                        <Text className="text-primary font-black text-sm">Resend Verification Code</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    onPress={() => Linking.openURL('mailto:').catch(() => {})}
                    className="bg-white border border-border w-full h-[52px] rounded-xl items-center justify-center shadow-sm mb-4"
                >
                    <Text className="text-textPrimary font-bold text-base">Open Email App</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setStep('login')} className="w-full h-[52px] rounded-xl items-center justify-center">
                    <Text className="text-primary font-black text-base">Back to Login</Text>
                </TouchableOpacity>

                {resendStatus ? (
                    <Text className="text-primary font-bold text-xs mt-6 text-center">{resendStatus}</Text>
                ) : null}
            </View>
        );
    };

    const renderSignupStep2 = () => (
        <ScrollView className="flex-1 bg-lightBackground px-6 pt-12" showsVerticalScrollIndicator={false}>
            <Text className="text-3xl font-black text-textPrimary mb-2">Setup Business</Text>
            <Text className="text-textSecondary font-bold mb-8">Enter your business details to configure your store.</Text>

            {/* Business Name */}
            <View className="mb-5">
                <Text className="text-textSecondary text-xs font-black uppercase mb-2">Business Name</Text>
                <View className="flex-row items-center bg-white border border-border rounded-xl px-4 h-14 shadow-sm">
                    <Store size={20} color="#94A3B8" className="mr-3" />
                    <TextInput
                        className="flex-1 font-bold text-base text-textPrimary"
                        placeholder="e.g. Joyful Provisions"
                        placeholderTextColor="#94A3B8"
                        value={businessName}
                        onChangeText={setBusinessName}
                    />
                </View>
            </View>

            {/* Business Type */}
            <View className="mb-5 relative z-50">
                <Text className="text-textSecondary text-xs font-black uppercase mb-2">Business Type</Text>
                <TouchableOpacity
                    onPress={() => setTypeDropdownOpen(!typeDropdownOpen)}
                    className="flex-row justify-between items-center bg-white border border-border rounded-xl px-4 h-14 shadow-sm"
                >
                    <Text className="font-bold text-base text-textPrimary">{businessType}</Text>
                    <ChevronRight
                        size={20}
                        color="#94A3B8"
                        style={{ transform: [{ rotate: typeDropdownOpen ? '90deg' : '0deg' }] }}
                    />
                </TouchableOpacity>

                {typeDropdownOpen && (
                    <View className="absolute top-[80px] left-0 right-0 bg-white border border-border rounded-xl shadow-lg z-50 p-2">
                        {BUSINESS_TYPES.map((type) => (
                            <TouchableOpacity
                                key={type}
                                className="py-3 px-4 rounded-lg active:bg-lightBackground"
                                onPress={() => {
                                    setBusinessType(type);
                                    setTypeDropdownOpen(false);
                                }}
                            >
                                <Text className="font-bold text-textPrimary">{type}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {businessType === 'Other' && (
                <View className="mb-5">
                    <Text className="text-textSecondary text-xs font-black uppercase mb-2">Specify Business Type</Text>
                    <View className="bg-white border border-border rounded-xl px-4 h-14 shadow-sm justify-center">
                        <TextInput
                            className="font-bold text-base text-textPrimary"
                            placeholder="What do you sell?"
                            placeholderTextColor="#94A3B8"
                            value={otherBusinessType}
                            onChangeText={setOtherBusinessType}
                        />
                    </View>
                </View>
            )}

            {signupError ? <Text className="text-red-500 font-bold text-xs mb-6 text-center">{signupError}</Text> : null}

            <TouchableOpacity
                onPress={handleCompleteSetup}
                disabled={loading}
                className="w-full h-14 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/20 mb-12"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg">Complete Setup</Text>}
            </TouchableOpacity>
        </ScrollView>
    );

    const renderResetPassword = () => (
        <View className="flex-1 bg-lightBackground px-6 pt-12">
            <Text className="text-3xl font-black text-textPrimary mb-2">Set New Password</Text>
            <Text className="text-textSecondary font-bold mb-8">Enter your new password to secure your account.</Text>

            <View className="mb-5">
                <Text className="text-textSecondary text-xs font-black uppercase mb-2">New Password</Text>
                <View className="flex-row items-center bg-white border border-border rounded-xl px-4 h-14 shadow-sm">
                    <Lock size={20} color="#94A3B8" className="mr-3" />
                    <TextInput
                        className="flex-1 font-bold text-base text-textPrimary"
                        placeholder="At least 8 characters"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showNewPassword}
                        value={newPassword}
                        onChangeText={setNewPassword}
                    />
                    <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                        {showNewPassword ? <EyeOff size={20} color="#94A3B8" /> : <Eye size={20} color="#94A3B8" />}
                    </TouchableOpacity>
                </View>

                {/* Password Strength Checklist */}
                {newPassword.length > 0 && (
                    <View className="bg-white border border-border rounded-xl p-4 mt-4">
                        <Text className="text-textSecondary text-[11px] font-black uppercase mb-2">
                            Password Requirements
                        </Text>
                        <View className="flex-row items-center mb-1">
                            <CheckCircle size={14} color={hasResetLength ? '#16A34A' : '#94A3B8'} />
                            <Text className={`text-xs ml-2 font-bold ${hasResetLength ? 'text-primary' : 'text-textSecondary'}`}>
                                At least 8 characters
                            </Text>
                        </View>
                        <View className="flex-row items-center mb-1">
                            <CheckCircle size={14} color={hasResetUpper ? '#16A34A' : '#94A3B8'} />
                            <Text className={`text-xs ml-2 font-bold ${hasResetUpper ? 'text-primary' : 'text-textSecondary'}`}>
                                At least 1 uppercase letter
                            </Text>
                        </View>
                        <View className="flex-row items-center mb-1">
                            <CheckCircle size={14} color={hasResetNumber ? '#16A34A' : '#94A3B8'} />
                            <Text className={`text-xs ml-2 font-bold ${hasResetNumber ? 'text-primary' : 'text-textSecondary'}`}>
                                At least 1 number
                            </Text>
                        </View>
                        <View className="flex-row items-center">
                            <CheckCircle size={14} color={hasResetSpecial ? '#16A34A' : '#94A3B8'} />
                            <Text className={`text-xs ml-2 font-bold ${hasResetSpecial ? 'text-primary' : 'text-textSecondary'}`}>
                                At least 1 special character
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            {resetError ? <Text className="text-red-500 font-bold text-xs mb-6 text-center">{resetError}</Text> : null}

            <TouchableOpacity
                onPress={handleResetPassword}
                disabled={loading}
                className="w-full h-14 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/20 mb-6"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg">Update Password</Text>}
            </TouchableOpacity>
        </View>
    );

    const renderWalkthrough = () => {
        const slide = WALKTHROUGH_SLIDES[walkthroughPage];
        const SlideIcon = slide.icon;
        return (
            <View className="flex-1 bg-white justify-between px-6 pb-12 pt-16">
                <View className="items-end">
                    <TouchableOpacity
                        onPress={() => {
                            setShowWalkthrough(false);
                            setStep('welcome');
                        }}
                    >
                        <Text className="text-textSecondary font-black text-base">Skip</Text>
                    </TouchableOpacity>
                </View>

                <View className="items-center px-4">
                    <View className="w-24 h-24 bg-green-50 rounded-[32px] items-center justify-center mb-10">
                        <SlideIcon size={48} color="#16A34A" />
                    </View>
                    <Text className="text-3xl font-black text-textPrimary text-center mb-4 leading-9">{slide.title}</Text>
                    <Text className="text-textSecondary font-bold text-base text-center leading-6">{slide.description}</Text>
                </View>

                <View>
                    {/* Indicator dots */}
                    <View className="flex-row justify-center mb-10">
                        {WALKTHROUGH_SLIDES.map((_, i) => (
                            <View
                                key={i}
                                className={`h-2 rounded-full mx-1.5 ${
                                    walkthroughPage === i ? 'w-6 bg-primary' : 'w-2 bg-border'
                                }`}
                            />
                        ))}
                    </View>

                    <TouchableOpacity
                        onPress={() => {
                            if (walkthroughPage < WALKTHROUGH_SLIDES.length - 1) {
                                setWalkthroughPage((p) => p + 1);
                            } else {
                                setShowWalkthrough(false);
                                setStep('welcome');
                            }
                        }}
                        className="w-full h-14 bg-primary rounded-xl items-center justify-center flex-row shadow-lg shadow-primary/20"
                    >
                        <Text className="text-white font-black text-lg mr-2">
                            {walkthroughPage === WALKTHROUGH_SLIDES.length - 1 ? 'Get Started' : 'Next'}
                        </Text>
                        <ChevronRight size={20} color="white" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (showSplash) {
        return (
            <View className="flex-1 bg-primary items-center justify-center">
                <View className="absolute -top-32 -left-32 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
                <View className="absolute -bottom-32 -right-32 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
                <View className="items-center justify-center">
                    <Image 
                        source={require('../../assets/logo-white.png')} 
                        style={{ width: 280, height: 130, resizeMode: 'contain' }} 
                    />
                    <Text className="text-white/80 font-bold text-sm mt-3 uppercase tracking-widest">
                        Sell. Track. Grow.
                    </Text>
                    <ActivityIndicator size="small" color="white" style={{ marginTop: 24 }} />
                </View>
            </View>
        );
    }

    if (showWalkthrough) {
        return renderWalkthrough();
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            {step === 'welcome' && renderWelcome()}
            {step === 'login' && renderLogin()}
            {step === 'signup_step1' && renderSignupStep1()}
            {step === 'verify_email' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                        <View style={{ paddingTop: insets.top, flex: 1, backgroundColor: '#F8FAFC' }}>
                            {renderVerifyEmail()}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
            {step === 'signup_step2' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                        <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom, flex: 1, backgroundColor: '#F8FAFC' }}>
                            {renderSignupStep2()}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
            {step === 'reset_password' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                        <View style={{ paddingTop: insets.top, flex: 1, backgroundColor: '#F8FAFC' }}>
                            {renderResetPassword()}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* Forgot Password Modal Sheet */}
            <Modal visible={forgotPasswordVisible} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
                >
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={1}
                        onPress={() => {
                            setForgotPasswordVisible(false);
                            setForgotEmail('');
                            setForgotError('');
                        }}
                    />
                    <View
                        style={{
                            backgroundColor: 'white',
                            borderTopLeftRadius: 40,
                            borderTopRightRadius: 40,
                            padding: 24,
                            paddingBottom: Math.max(insets.bottom + 24, 40),
                        }}
                    >
                            <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />

                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-2xl font-black text-textPrimary">Reset Password</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setForgotPasswordVisible(false);
                                        setForgotEmail('');
                                        setForgotError('');
                                    }}
                                    className="bg-lightBackground p-2 rounded-full"
                                >
                                    <X size={20} color="#0F172A" />
                                </TouchableOpacity>
                            </View>

                            <View>
                                <Text className="text-textSecondary font-bold mb-6">
                                    Enter your registered email address to receive a secure password reset link.
                                </Text>

                                <View
                                    className={`flex-row items-center bg-lightBackground border rounded-xl px-4 h-14 mb-2 ${
                                        forgotError ? 'border-red-500' : 'border-border'
                                    }`}
                                >
                                    <Mail size={20} color="#94A3B8" className="mr-3" />
                                    <TextInput
                                        className="flex-1 font-bold text-base text-textPrimary"
                                        placeholder="e.g. name@company.com"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={forgotEmail}
                                        onChangeText={(t) => {
                                            setForgotEmail(t);
                                            if (forgotError) setForgotError('');
                                        }}
                                        autoFocus
                                    />
                                </View>
                                {forgotError ? (
                                    <Text className="text-red-500 font-bold text-xs mb-6 ml-1">{forgotError}</Text>
                                ) : (
                                    <View className="h-4" />
                                )}

                                <TouchableOpacity
                                    onPress={handleForgotPassword}
                                    disabled={forgotLoading || !forgotEmail}
                                    className={`w-full h-[52px] rounded-xl items-center flex-row justify-center shadow-sm ${
                                        forgotEmail && !forgotLoading ? 'bg-primary active:bg-[#15803D]' : 'bg-primary/50'
                                    }`}
                                >
                                    {forgotLoading ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <>
                                            <Text className="text-white font-black text-lg mr-2">Send Reset Link</Text>
                                            <ChevronRight size={20} color="white" />
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
            </Modal>

            <AppModal
                visible={modalConfig.visible}
                type={modalConfig.type}
                title={modalConfig.title}
                subtitle={modalConfig.subtitle}
                onDismiss={() => setModalConfig((prev) => ({ ...prev, visible: false }))}
            />
        </View>
    );
}
