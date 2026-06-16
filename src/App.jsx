import React, { useState, useEffect, useRef } from 'react';
import { 
  Flame, 
  Activity, 
  TrendingUp, 
  Heart, 
  Trophy, 
  Timer, 
  Calculator, 
  History, 
  Play, 
  Pause, 
  Square, 
  User, 
  Plus, 
  Minus, 
  Info,
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import {
  auth,
  googleProvider,
  appleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  db
} from './firebase';
import { doc, onSnapshot, setDoc } from "firebase/firestore";

export default function App() {
  // Navigation tab within app
  const [activeTab, setActiveTab] = useState('summary');

  // Helper to read initial metric values from localstorage based on logged-in user or guest
  const getSavedMetric = (baseKey, defaultValue) => {
    const savedUserStr = localStorage.getItem('fit_user');
    let keyPrefix = 'guest';
    if (savedUserStr) {
      try {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && parsed.isLoggedIn && parsed.email) {
          keyPrefix = parsed.email;
        }
      } catch (e) {
        console.error(e);
      }
    }
    const savedValue = localStorage.getItem(`fit_${keyPrefix}_${baseKey}`);
    return savedValue !== null ? savedValue : defaultValue;
  };

  // Core Fitness State (Saved in LocalStorage, scoped by user)
  const [steps, setSteps] = useState(() => parseInt(getSavedMetric('steps', '0'), 10));
  const [stairsUp, setStairsUp] = useState(() => parseInt(getSavedMetric('stairs_up', '0'), 10));
  const [stairsDown, setStairsDown] = useState(() => parseInt(getSavedMetric('stairs_down', '0'), 10));
  
  // Custom Fitness Goals (Saved in LocalStorage, scoped by user)
  const [goals, setGoals] = useState(() => {
    const saved = getSavedMetric('goals', null);
    return saved ? JSON.parse(saved) : { move: 500, exercise: 30, stand: 12 };
  });

  // Goals customization editor open/close state
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);

  // Water Intake State
  const [waterIntake, setWaterIntake] = useState(() => parseInt(getSavedMetric('water_intake', '0'), 10));

  // Live Smart Device Ticker & Cloud Sync State variables
  const [liveTracking, setLiveTracking] = useState(true);
  const [currentHeartRate, setCurrentHeartRate] = useState(72);
  const [syncStatus, setSyncStatus] = useState('local'); // local, syncing, synced, error
  const lastSyncRef = useRef(null);

  // Derived state
  const [workoutCalories, setWorkoutCalories] = useState(() => parseInt(getSavedMetric('workout_calories', '0'), 10));
  const moveCalories = Math.round((steps * 0.04) + (stairsUp * 0.15) + (stairsDown * 0.05) + workoutCalories);

  // Exercise Minutes: Workouts duration + Steps contribution (1 min per 100 fast steps, simulated)
  const [workoutMinutes, setWorkoutMinutes] = useState(() => parseInt(getSavedMetric('workout_minutes', '0'), 10));
  const exerciseMinutes = Math.round(workoutMinutes + (steps * 0.002)); // base exercise contribution from walking

  // Stand Hours / Stair targets
  const standHours = Math.min(12, stairsUp + (steps > 0 ? Math.floor(steps / 1500) : 0));

  // Workout History (Scoped by user)
  const [workoutLogs, setWorkoutLogs] = useState(() => {
    const saved = getSavedMetric('workout_logs', '[]');
    return JSON.parse(saved);
  });

  // Hourly steps distribution for visual chart (All starts at 0 for a real tracker)
  const [hourlySteps, setHourlySteps] = useState([
    { hour: '9a', count: 0 },
    { hour: '10a', count: 0 },
    { hour: '11a', count: 0 },
    { hour: '12p', count: 0 },
    { hour: '1p', count: 0 },
    { hour: '2p', count: 0 },
    { hour: '3p', count: 0 },
    { hour: '4p', count: 0 },
    { hour: '5p', count: 0 },
  ]);

  // Active workout session state
  const [activeSession, setActiveSession] = useState(null); // { type, duration, calories, heartRate, intervalId }
  const [isPaused, setIsPaused] = useState(false);
  const sessionTimerRef = useRef(null);

  // Auto Simulator (walking/running) state
  const [autoSimActive, setAutoSimActive] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1); // 1 = Normal, 2 = Fast, 5 = Sprint
  const autoSimIntervalRef = useRef(null);

  // Mobile Device motion sensors state
  const [sensorStatus, setSensorStatus] = useState('idle'); // idle, checking, active, error, denied

  // BMI Calculator State
  const [bmiInput, setBmiInput] = useState({ height: '', weight: '' });
  const [bmiResult, setBmiResult] = useState(null);

  // Pace Calculator State
  const [paceInput, setPaceInput] = useState({ distance: '', time: '' });
  const [paceResult, setPaceResult] = useState(null);

  // Target Calorie Planner State
  const [calorieInput, setCalorieInput] = useState({ goal: 'loss', weight: '', activity: '1.2' });
  const [calorieResult, setCalorieResult] = useState(null);

  // User Profile & Authentication States
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('fit_user');
    return saved ? JSON.parse(saved) : { name: 'John Doe', email: 'john@example.com', isLoggedIn: true };
  });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login, signup
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  const currentUserRef = useRef(user.email || 'guest');

  // Listen to Firebase authentication state changes
  useEffect(() => {
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (isMockFirebase) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          email: firebaseUser.email,
          isLoggedIn: true
        });
      } else {
        setUser({
          name: '',
          email: '',
          isLoggedIn: false
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Load user-specific stats when logged-in user changes
  useEffect(() => {
    const keyPrefix = user.isLoggedIn && user.email ? user.email : 'guest';
    currentUserRef.current = keyPrefix; // update ref BEFORE setting state to prevent saving old values to new keys!
    
    const savedSteps = localStorage.getItem(`fit_${keyPrefix}_steps`);
    setSteps(savedSteps ? parseInt(savedSteps, 10) : 0);
    
    const savedStairsUp = localStorage.getItem(`fit_${keyPrefix}_stairs_up`);
    setStairsUp(savedStairsUp ? parseInt(savedStairsUp, 10) : 0);
    
    const savedStairsDown = localStorage.getItem(`fit_${keyPrefix}_stairs_down`);
    setStairsDown(savedStairsDown ? parseInt(savedStairsDown, 10) : 0);
    
    const savedCal = localStorage.getItem(`fit_${keyPrefix}_workout_calories`);
    setWorkoutCalories(savedCal ? parseInt(savedCal, 10) : 0);
    
    const savedMin = localStorage.getItem(`fit_${keyPrefix}_workout_minutes`);
    setWorkoutMinutes(savedMin ? parseInt(savedMin, 10) : 0);
    
    const savedLogs = localStorage.getItem(`fit_${keyPrefix}_workout_logs`);
    setWorkoutLogs(savedLogs ? JSON.parse(savedLogs) : []);

    const savedWater = localStorage.getItem(`fit_${keyPrefix}_water_intake`);
    setWaterIntake(savedWater ? parseInt(savedWater, 10) : 0);

    const savedGoals = localStorage.getItem(`fit_${keyPrefix}_goals`);
    setGoals(savedGoals ? JSON.parse(savedGoals) : { move: 500, exercise: 30, stand: 12 });
  }, [user.email, user.isLoggedIn]);

  // Save user-scoped metrics on state changes
  useEffect(() => {
    const keyPrefix = user.isLoggedIn && user.email ? user.email : 'guest';
    // Only save if the ref matches the current keyPrefix (meaning we are not mid-load)
    if (currentUserRef.current === keyPrefix) {
      localStorage.setItem(`fit_${keyPrefix}_steps`, steps);
      localStorage.setItem(`fit_${keyPrefix}_stairs_up`, stairsUp);
      localStorage.setItem(`fit_${keyPrefix}_stairs_down`, stairsDown);
      localStorage.setItem(`fit_${keyPrefix}_workout_calories`, workoutCalories);
      localStorage.setItem(`fit_${keyPrefix}_workout_minutes`, workoutMinutes);
      localStorage.setItem(`fit_${keyPrefix}_workout_logs`, JSON.stringify(workoutLogs));
      localStorage.setItem(`fit_${keyPrefix}_water_intake`, waterIntake);
      localStorage.setItem(`fit_${keyPrefix}_goals`, JSON.stringify(goals));
    }
  }, [steps, stairsUp, stairsDown, workoutCalories, workoutMinutes, workoutLogs, waterIntake, goals, user]);

  useEffect(() => {
    localStorage.setItem('fit_user', JSON.stringify(user));
  }, [user]);

  // Sync background heart rate monitor with active workout session heart rate
  useEffect(() => {
    if (activeSession && activeSession.heartRate) {
      setCurrentHeartRate(activeSession.heartRate);
    }
  }, [activeSession?.heartRate]);

  // Background Activity Live Ticker (Simulates live Apple Watch data in real-time)
  useEffect(() => {
    if (!liveTracking) return;

    // 1. Rest Heart Rate fluctuation loop
    const hrInterval = setInterval(() => {
      if (activeSession) return; // Active workout takes priority
      setCurrentHeartRate(prev => {
        const baseline = 72 + Math.sin(Date.now() / 18000) * 6;
        const change = (Math.random() - 0.5) * 5;
        const target = Math.round((prev + baseline) / 2 + change);
        return Math.max(58, Math.min(95, target));
      });
    }, 2000);

    // 2. Passive background steps generator (updates rings/counters live)
    const activityInterval = setInterval(() => {
      if (activeSession) return; // Workout simulator controls workout stats

      if (Math.random() > 0.6) {
        const stepAdd = Math.floor(Math.random() * 4) + 1;
        setSteps(prev => prev + stepAdd);

        // Climb random stairs occasionally
        if (Math.random() > 0.97) {
          setStairsUp(prev => prev + 1);
        }
      }
    }, 5000);

    return () => {
      clearInterval(hrInterval);
      clearInterval(activityInterval);
    };
  }, [liveTracking, activeSession]);

  // Firestore Database subscription (Read real-time documents)
  useEffect(() => {
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (isMockFirebase || !user.isLoggedIn || !user.email) {
      setSyncStatus('local');
      return;
    }

    setSyncStatus('syncing');
    const userDocRef = doc(db, "users", user.email, "fitness", "dailyStats");
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        lastSyncRef.current = data;
        
        if (data.steps !== undefined && data.steps !== steps) setSteps(data.steps);
        if (data.stairsUp !== undefined && data.stairsUp !== stairsUp) setStairsUp(data.stairsUp);
        if (data.stairsDown !== undefined && data.stairsDown !== stairsDown) setStairsDown(data.stairsDown);
        if (data.workoutCalories !== undefined && data.workoutCalories !== workoutCalories) setWorkoutCalories(data.workoutCalories);
        if (data.workoutMinutes !== undefined && data.workoutMinutes !== workoutMinutes) setWorkoutMinutes(data.workoutMinutes);
        if (data.waterIntake !== undefined && data.waterIntake !== waterIntake) setWaterIntake(data.waterIntake);
        if (data.goals !== undefined && JSON.stringify(data.goals) !== JSON.stringify(goals)) setGoals(data.goals);
        if (data.workoutLogs !== undefined && JSON.stringify(data.workoutLogs) !== JSON.stringify(workoutLogs)) setWorkoutLogs(data.workoutLogs);
        
        setSyncStatus('synced');
      } else {
        setDoc(userDocRef, {
          steps,
          stairsUp,
          stairsDown,
          workoutCalories,
          workoutMinutes,
          waterIntake,
          goals,
          workoutLogs
        }, { merge: true })
        .then(() => setSyncStatus('synced'))
        .catch(err => {
          console.error("Firestore sync init failed:", err);
          setSyncStatus('error');
        });
      }
    }, (err) => {
      console.error("Firestore sync subscription error:", err);
      setSyncStatus('error');
    });

    return () => unsubscribe();
  }, [user.email, user.isLoggedIn]);

  // Firestore Database write (Sync changed data to Firestore in real-time)
  useEffect(() => {
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (isMockFirebase || !user.isLoggedIn || !user.email) return;

    const hasChanges = !lastSyncRef.current || 
      steps !== lastSyncRef.current.steps ||
      stairsUp !== lastSyncRef.current.stairsUp ||
      stairsDown !== lastSyncRef.current.stairsDown ||
      workoutCalories !== lastSyncRef.current.workoutCalories ||
      workoutMinutes !== lastSyncRef.current.workoutMinutes ||
      waterIntake !== lastSyncRef.current.waterIntake ||
      JSON.stringify(goals) !== JSON.stringify(lastSyncRef.current.goals) ||
      JSON.stringify(workoutLogs) !== JSON.stringify(lastSyncRef.current.workoutLogs);

    if (!hasChanges) return;

    // Debounce to prevent throttling
    const syncTimeout = setTimeout(() => {
      setSyncStatus('syncing');
      const userDocRef = doc(db, "users", user.email, "fitness", "dailyStats");
      setDoc(userDocRef, {
        steps,
        stairsUp,
        stairsDown,
        workoutCalories,
        workoutMinutes,
        waterIntake,
        goals,
        workoutLogs
      }, { merge: true })
      .then(() => {
        setSyncStatus('synced');
        lastSyncRef.current = {
          steps,
          stairsUp,
          stairsDown,
          workoutCalories,
          workoutMinutes,
          waterIntake,
          goals,
          workoutLogs
        };
      })
      .catch((err) => {
        console.error("Firestore sync write failed:", err);
        setSyncStatus('error');
      });
    }, 1200);

    return () => clearTimeout(syncTimeout);
  }, [steps, stairsUp, stairsDown, workoutCalories, workoutMinutes, waterIntake, goals, workoutLogs, user.email, user.isLoggedIn]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    // Check if running in mock/offline mode (using fallback/placeholder keys)
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    
    if (isMockFirebase) {
      setUser({
        name: authMode === 'login' ? (authName || authEmail.split('@')[0]) : (authName || 'New User'),
        email: authEmail,
        isLoggedIn: true
      });
      setShowProfileModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      return;
    }

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCredential.user, {
          displayName: authName || authEmail.split('@')[0]
        });
        // Set user details locally so they update immediately
        setUser({
          name: authName || authEmail.split('@')[0],
          email: authEmail,
          isLoggedIn: true
        });
      }
      setShowProfileModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/invalid-api-key') {
        console.warn('Invalid Firebase API Key. Falling back to offline mock mode.');
        setUser({
          name: authMode === 'login' ? (authName || authEmail.split('@')[0]) : (authName || 'New User'),
          email: authEmail,
          isLoggedIn: true
        });
        setShowProfileModal(false);
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
        return;
      }
      setAuthError(msg);
    }
  };

  const handleLogout = async () => {
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (!isMockFirebase) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Sign out error:", err);
      }
    }
    setUser({
      name: '',
      email: '',
      isLoggedIn: false
    });
    setShowProfileModal(false);
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (isMockFirebase) {
      setUser({ name: 'Google User', email: 'google.account@gmail.com', isLoggedIn: true });
      setShowProfileModal(false);
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      setUser({
        name: user.displayName || 'Google User',
        email: user.email,
        isLoggedIn: true
      });
      setShowProfileModal(false);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key' || err.code === 'auth/internal-error') {
        console.warn('Google Auth is not enabled in Firebase Console. Falling back to mock login.');
        setUser({ name: 'Google User', email: 'google.account@gmail.com', isLoggedIn: true });
        setShowProfileModal(false);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup closed by user.');
      } else {
        setAuthError(err.message);
      }
    }
  };

  const handleAppleSignIn = async () => {
    setAuthError('');
    const isMockFirebase = import.meta.env.VITE_FIREBASE_API_KEY === 'AIzaSyPlaceholderKeyForViteDevBuild' || !import.meta.env.VITE_FIREBASE_API_KEY;
    if (isMockFirebase) {
      setUser({ name: 'Apple User', email: 'apple.id@icloud.com', isLoggedIn: true });
      setShowProfileModal(false);
      return;
    }
    try {
      const result = await signInWithPopup(auth, appleProvider);
      const user = result.user;
      setUser({
        name: user.displayName || 'Apple User',
        email: user.email,
        isLoggedIn: true
      });
      setShowProfileModal(false);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found' || err.code === 'auth/invalid-api-key' || err.code === 'auth/internal-error') {
        console.warn('Apple Auth is not configured in Firebase Console. Falling back to mock login.');
        setUser({ name: 'Apple User', email: 'apple.id@icloud.com', isLoggedIn: true });
        setShowProfileModal(false);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in popup closed by user.');
      } else {
        setAuthError(err.message);
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[parts.length - 1] ? parts[parts.length - 1][0] : '')).toUpperCase();
  };

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (autoSimIntervalRef.current) clearInterval(autoSimIntervalRef.current);
    };
  }, []);

  // Disable body scroll when modal is open or active workout session is running
  useEffect(() => {
    if (showProfileModal || activeSession) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showProfileModal, activeSession]);

  // Update hourly charts dynamically when steps update
  useEffect(() => {
    // Add current steps to the latest active hours
    const currentHourIndex = 6; // index for 3p
    setHourlySteps(prev => {
      const copy = [...prev];
      // calculate simulated difference or current hour display
      const totalPastHours = copy.slice(0, 6).reduce((acc, h) => acc + h.count, 0);
      const remainingSteps = Math.max(0, steps - totalPastHours);
      copy[6].count = Math.round(remainingSteps * 0.6);
      copy[7].count = Math.round(remainingSteps * 0.4);
      return copy;
    });
  }, [steps]);

  // Start Auto Walk Simulator for active session steps
  const toggleAutoSim = () => {
    if (autoSimActive) {
      clearInterval(autoSimIntervalRef.current);
      setAutoSimActive(false);
    } else {
      setAutoSimActive(true);
      autoSimIntervalRef.current = setInterval(() => {
        setActiveSession(prev => {
          if (!prev) return null;
          const stepInc = 4;
          const nextSteps = (prev.steps || 0) + stepInc;
          const nextDistance = parseFloat((nextSteps * 0.00075).toFixed(3));
          return {
            ...prev,
            steps: nextSteps,
            distance: nextDistance
          };
        });
      }, 500);
    }
  };

  // Request & Connect Accelerometer for mobile pedometer simulation
  const requestSensorPermission = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        setSensorStatus('checking');
        const permissionState = await DeviceMotionEvent.requestPermission();
        if (permissionState === 'granted') {
          startDeviceMotionListener();
        } else {
          setSensorStatus('denied');
        }
      } catch (err) {
        console.error(err);
        setSensorStatus('error');
      }
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      // Direct integration for browsers that don't need requestPermission
      startDeviceMotionListener();
    } else {
      setSensorStatus('error');
      alert('Accelerometer DeviceMotionEvent not supported on this browser/device.');
    }
  };

  const startDeviceMotionListener = () => {
    setSensorStatus('active');
    let lastX = null, lastY = null, lastZ = null;
    let threshold = 15; // shake acceleration threshold
    let lastTime = Date.now();

    const handleMotionEvent = (event) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;
      
      let currTime = Date.now();
      if ((currTime - lastTime) > 100) {
        let diffTime = currTime - lastTime;
        lastTime = currTime;

        let x = acc.x;
        let y = acc.y;
        let z = acc.z;

        if (lastX !== null) {
          let speed = Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime * 10000;
          if (speed > threshold) {
            // Motion shake detected! Let's update activeSession!
            setActiveSession(prev => {
              if (!prev) return null;
              
              let nextSteps = prev.steps || 0;
              let nextDistance = prev.distance || 0;
              let nextStairsUp = prev.stairsUp || 0;
              let nextStrokes = prev.strokes || 0;
              let nextSwings = prev.swings || 0;
              
              if (['Walking', 'Running'].includes(prev.type)) {
                nextSteps += 1;
                nextDistance = parseFloat((nextSteps * 0.00075).toFixed(3));
              } else if (prev.type === 'Stair Climbing') {
                nextSteps += 1;
                if (Math.random() > 0.8) {
                  nextStairsUp += 1;
                }
              } else if (prev.type === 'Swimming') {
                nextStrokes += 1;
              } else if (['Badminton', 'Tennis'].includes(prev.type)) {
                nextSwings += 1;
              }

              return {
                ...prev,
                steps: nextSteps,
                distance: nextDistance,
                stairsUp: nextStairsUp,
                strokes: nextStrokes,
                swings: nextSwings
              };
            });
          }
        }
        lastX = x;
        lastY = y;
        lastZ = z;
      }
    };

    window.addEventListener('devicemotion', handleMotionEvent);
  };

  // Workout sessions tracking
  const workoutsList = [
    { type: 'Running', icon: '🏃', color: 'linear-gradient(135deg, #ff1b55, #ff5e3a)', baseHeartRate: 140, calorieBurnRate: 11 }, // kcal/min
    { type: 'Walking', icon: '🚶', color: 'linear-gradient(135deg, #b1f900, #00f968)', baseHeartRate: 105, calorieBurnRate: 5 },
    { type: 'Stair Climbing', icon: '🪜', color: 'linear-gradient(135deg, #ffd60a, #ff9f0a)', baseHeartRate: 120, calorieBurnRate: 7 },
    { type: 'Swimming', icon: '🏊', color: 'linear-gradient(135deg, #00d2ff, #0066ff)', baseHeartRate: 130, calorieBurnRate: 9 },
    { type: 'Badminton', icon: '🏸', color: 'linear-gradient(135deg, #ff9f0a, #ffd60a)', baseHeartRate: 135, calorieBurnRate: 8 },
    { type: 'Tennis', icon: '🎾', color: 'linear-gradient(135deg, #aa3bff, #ff0055)', baseHeartRate: 130, calorieBurnRate: 7.5 },
    { type: 'Cycling', icon: '🚴', color: 'linear-gradient(135deg, #30d158, #00f968)', baseHeartRate: 125, calorieBurnRate: 8.5 },
    { type: 'Yoga', icon: '🧘', color: 'linear-gradient(135deg, #bf5af2, #ff5e3a)', baseHeartRate: 95, calorieBurnRate: 3.5 },
  ];

  // Session-specific simulation triggers
  const handleSessionAddSteps = (amount) => {
    setActiveSession(prev => {
      if (!prev) return null;
      const nextSteps = (prev.steps || 0) + amount;
      const nextDistance = parseFloat((nextSteps * 0.00075).toFixed(3));
      return {
        ...prev,
        steps: nextSteps,
        distance: nextDistance
      };
    });
  };

  const handleSessionAddStairsUp = () => {
    setActiveSession(prev => {
      if (!prev) return null;
      const nextStairsUp = (prev.stairsUp || 0) + 1;
      const nextSteps = (prev.steps || 0) + 15;
      const nextDistance = parseFloat((nextSteps * 0.00075).toFixed(3));
      return {
        ...prev,
        stairsUp: nextStairsUp,
        steps: nextSteps,
        distance: nextDistance
      };
    });
  };

  const handleSessionAddStairsDown = () => {
    setActiveSession(prev => {
      if (!prev) return null;
      const nextStairsDown = (prev.stairsDown || 0) + 1;
      const nextSteps = (prev.steps || 0) + 12;
      const nextDistance = parseFloat((nextSteps * 0.00075).toFixed(3));
      return {
        ...prev,
        stairsDown: nextStairsDown,
        steps: nextSteps,
        distance: nextDistance
      };
    });
  };

  const handleSessionAddStrokes = (amount) => {
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        strokes: (prev.strokes || 0) + amount
      };
    });
  };

  const handleSessionAddLap = () => {
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        laps: (prev.laps || 0) + 1,
        strokes: (prev.strokes || 0) + 20
      };
    });
  };

  const handleSessionAddSwings = (amount) => {
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        swings: (prev.swings || 0) + amount
      };
    });
  };

  const handleSessionAddPedals = () => {
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        distance: parseFloat((prev.distance + 0.5).toFixed(2))
      };
    });
  };

  const handleSessionAddBreaths = () => {
    setActiveSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        breaths: (prev.breaths || 0) + 1
      };
    });
  };

  const startWorkout = (workout) => {
    setActiveTab('workouts');
    setIsPaused(false);
    setActiveSession({
      type: workout.type,
      icon: workout.icon,
      duration: 0,
      calories: 0,
      heartRate: workout.baseHeartRate,
      baseHeartRate: workout.baseHeartRate,
      calorieBurnRate: workout.calorieBurnRate,
      distance: 0,
      steps: 0,
      stairsUp: 0,
      stairsDown: 0,
      strokes: 0,
      swings: 0,
      laps: 0,
      breaths: 0,
      heartRateHistory: [workout.baseHeartRate]
    });

    sessionTimerRef.current = setInterval(() => {
      setActiveSession(prev => {
        if (!prev) return null;
        const nextDuration = prev.duration + 1; // secs
        
        // Realistic fluctuating heart rate
        const hrOffset = Math.sin(nextDuration / 5) * 5 + (Math.random() - 0.5) * 4;
        const nextHR = Math.round(prev.baseHeartRate + hrOffset);

        // Compute calories dynamically
        // Baseline burn based on duration
        const timeCalories = (nextDuration / 60) * prev.calorieBurnRate;
        // Action burn based on steps/strokes/swings
        const actionCalories = 
          ((prev.steps || 0) * 0.04) + 
          ((prev.stairsUp || 0) * 0.15) + 
          ((prev.stairsDown || 0) * 0.05) +
          ((prev.strokes || 0) * 0.12) + 
          ((prev.swings || 0) * 0.10) +
          (prev.type === 'Cycling' ? (prev.distance || 0) * 18 : 0) +
          ((prev.breaths || 0) * 0.5);

        const nextCalories = Math.round(timeCalories + actionCalories);

        // Maintain scrolling history
        const history = prev.heartRateHistory ? [...prev.heartRateHistory, nextHR] : [nextHR];
        if (history.length > 15) history.shift();

        return {
          ...prev,
          duration: nextDuration,
          heartRate: nextHR,
          calories: nextCalories,
          heartRateHistory: history
        };
      });
    }, 1000);
  };

  const pauseWorkout = () => {
    clearInterval(sessionTimerRef.current);
    setIsPaused(true);
  };

  const resumeWorkout = () => {
    setIsPaused(false);
    sessionTimerRef.current = setInterval(() => {
      setActiveSession(prev => {
        if (!prev) return null;
        const nextDuration = prev.duration + 1; // secs
        const hrOffset = Math.sin(nextDuration / 5) * 5 + (Math.random() - 0.5) * 4;
        const nextHR = Math.round(prev.baseHeartRate + hrOffset);
        
        const timeCalories = (nextDuration / 60) * prev.calorieBurnRate;
        const actionCalories = 
          ((prev.steps || 0) * 0.04) + 
          ((prev.stairsUp || 0) * 0.15) + 
          ((prev.stairsDown || 0) * 0.05) +
          ((prev.strokes || 0) * 0.12) + 
          ((prev.swings || 0) * 0.10) +
          (prev.type === 'Cycling' ? (prev.distance || 0) * 18 : 0) +
          ((prev.breaths || 0) * 0.5);

        const nextCalories = Math.round(timeCalories + actionCalories);

        const history = prev.heartRateHistory ? [...prev.heartRateHistory, nextHR] : [nextHR];
        if (history.length > 15) history.shift();

        return {
          ...prev,
          duration: nextDuration,
          heartRate: nextHR,
          calories: nextCalories,
          heartRateHistory: history
        };
      });
    }, 1000);
  };

  const stopWorkout = () => {
    clearInterval(sessionTimerRef.current);
    if (autoSimActive) {
      clearInterval(autoSimIntervalRef.current);
      setAutoSimActive(false);
    }
    if (activeSession) {
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Update global daily totals!
      setSteps(prev => prev + (activeSession.steps || 0));
      setStairsUp(prev => prev + (activeSession.stairsUp || 0));
      setStairsDown(prev => prev + (activeSession.stairsDown || 0));
      
      // Workout contribution to daily rings
      setWorkoutCalories(prev => prev + (activeSession.calories || 0));
      setWorkoutMinutes(prev => prev + (Math.round(activeSession.duration / 60) || 1));
      
      // Build custom metric text for history log
      let customMetricText = '';
      if (['Walking', 'Running', 'Cycling'].includes(activeSession.type)) {
        customMetricText = `${activeSession.distance} km (${activeSession.steps || 0} Steps)`;
      } else if (activeSession.type === 'Swimming') {
        customMetricText = `${activeSession.strokes || 0} Strokes (${activeSession.laps || 0} Laps)`;
      } else if (['Badminton', 'Tennis'].includes(activeSession.type)) {
        customMetricText = `${activeSession.swings || 0} Swings`;
      } else if (activeSession.type === 'Stair Climbing') {
        customMetricText = `${activeSession.stairsUp || 0} F Up / ${activeSession.stairsDown || 0} F Dn`;
      } else if (activeSession.type === 'Yoga') {
        customMetricText = `${activeSession.breaths || 0} deep breaths`;
      } else {
        customMetricText = 'Completed';
      }

      const log = {
        id: Date.now(),
        type: activeSession.type,
        icon: activeSession.icon,
        duration: Math.round(activeSession.duration / 60) || 1, // minutes
        calories: activeSession.calories || 1,
        date: `Today, ${formattedTime}`,
        heartRate: activeSession.heartRate,
        customMetric: customMetricText
      };

      setWorkoutLogs(prev => [log, ...prev]);
    }
    setActiveSession(null);
    setIsPaused(false);
  };

  // Reset all current progress
  const resetDailyProgress = () => {
    if (confirm('Are you sure you want to reset your daily counter?')) {
      setSteps(0);
      setStairsUp(0);
      setStairsDown(0);
      setWorkoutCalories(0);
      setWorkoutMinutes(0);
      setWorkoutLogs([]);
      localStorage.clear();
    }
  };

  // BMI Calculation
  const calculateBMI = (e) => {
    e.preventDefault();
    const h = parseFloat(bmiInput.height) / 100; // cm to m
    const w = parseFloat(bmiInput.weight);
    if (h && w) {
      const score = parseFloat((w / (h * h)).toFixed(1));
      let desc = 'Normal';
      if (score < 18.5) desc = 'Underweight';
      else if (score >= 25 && score < 30) desc = 'Overweight';
      else if (score >= 30) desc = 'Obese';
      setBmiResult({ score, desc });
    }
  };

  // Pace Calculation
  const calculatePace = (e) => {
    e.preventDefault();
    const dist = parseFloat(paceInput.distance);
    const min = parseFloat(paceInput.time);
    if (dist && min) {
      const paceDecimal = min / dist;
      const paceMins = Math.floor(paceDecimal);
      const paceSecs = Math.round((paceDecimal - paceMins) * 60);
      setPaceResult(`${paceMins}:${paceSecs.toString().padStart(2, '0')} min/km`);
    }
  };

  // Target Calorie Planner Calculation
  const calculateCalorieTarget = (e) => {
    e.preventDefault();
    const weight = parseFloat(calorieInput.weight);
    const factor = parseFloat(calorieInput.activity);
    if (weight && factor) {
      // Basic metabolic rate estimate: Weight (kg) * 22
      const bmr = weight * 22;
      const tdee = Math.round(bmr * factor);
      let target = tdee;
      if (calorieInput.goal === 'loss') target = tdee - 450;
      else if (calorieInput.goal === 'gain') target = tdee + 400;
      
      setCalorieResult({ tdee, target });
    }
  };

  // Determine achievement achievements unlocked
  const checkUnlockedBadges = () => {
    return {
      earlyBird: steps > 1000,
      stairMaster: stairsUp >= 10,
      superStep: steps >= 10000,
      courtLegend: workoutLogs.some(log => (log.type === 'Badminton' || log.type === 'Tennis') && log.duration >= 1),
      aquaman: workoutLogs.some(log => log.type === 'Swimming' && log.duration >= 1),
      yogaZen: workoutLogs.some(log => log.type === 'Yoga' && log.duration >= 1)
    };
  };
  const badges = checkUnlockedBadges();

  // Ring SVGs Calculations
  const radiusOuter = 58;
  const radiusMiddle = 46;
  const radiusInner = 34;

  const strokeDashOuter = 2 * Math.PI * radiusOuter;
  const strokeDashMiddle = 2 * Math.PI * radiusMiddle;
  const strokeDashInner = 2 * Math.PI * radiusInner;

  const pctMove = Math.min(1, moveCalories / goals.move);
  const pctExercise = Math.min(1, exerciseMinutes / goals.exercise);
  const pctStand = Math.min(1, standHours / goals.stand);

  const offsetOuter = strokeDashOuter - (pctMove * strokeDashOuter);
  const offsetMiddle = strokeDashMiddle - (pctExercise * strokeDashMiddle);
  const offsetInner = strokeDashInner - (pctStand * strokeDashInner);

  return (
    <div className="app-shell">
      {/* WORKOUT ACTIVE SESSION SCREEN (OVERLAY OVER EVERYTHING) */}
      {activeSession ? (
        <div className="session-panel fade-in">
          <div className="session-header">
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>{activeSession.icon}</div>
            <div className="session-sport">{activeSession.type} WORKOUT</div>
            <div className="session-timer">
              {Math.floor(activeSession.duration / 60).toString().padStart(2, '0')}:
              {(activeSession.duration % 60).toString().padStart(2, '0')}
            </div>
          </div>

              <div className="session-stats-grid">
                <div className="session-stat">
                  <span className="session-stat-label">Active Calories</span>
                  <span className="session-stat-value" style={{ color: 'var(--color-move)' }}>
                    {activeSession.calories} <span style={{ fontSize: '12px' }}>kcal</span>
                  </span>
                </div>
                
                <div className="session-stat">
                  <span className="session-stat-label">Heart Rate</span>
                  <span className="session-stat-value" style={{ color: '#ff453a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Heart size={16} className="pulse" fill="#ff453a" /> {activeSession.heartRate} <span style={{ fontSize: '12px' }}>bpm</span>
                  </span>
                </div>

                {/* Walking, Running, Stair Climbing steps and distance */}
                {['Running', 'Walking', 'Stair Climbing'].includes(activeSession.type) && (
                  <>
                    <div className="session-stat">
                      <span className="session-stat-label">Steps</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-exercise)' }}>
                        {activeSession.steps || 0}
                      </span>
                    </div>
                    <div className="session-stat">
                      <span className="session-stat-label">Distance</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                        {activeSession.distance || 0} <span style={{ fontSize: '12px' }}>km</span>
                      </span>
                    </div>
                  </>
                )}

                {/* Stair Climbing vertical floors */}
                {activeSession.type === 'Stair Climbing' && (
                  <>
                    <div className="session-stat">
                      <span className="session-stat-label">Stairs Up</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-exercise)' }}>
                        {activeSession.stairsUp || 0} <span style={{ fontSize: '11px' }}>F</span>
                      </span>
                    </div>
                    <div className="session-stat">
                      <span className="session-stat-label">Stairs Dn</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                        {activeSession.stairsDown || 0} <span style={{ fontSize: '11px' }}>F</span>
                      </span>
                    </div>
                  </>
                )}

                {/* Swimming details */}
                {activeSession.type === 'Swimming' && (
                  <>
                    <div className="session-stat">
                      <span className="session-stat-label">Swim Strokes</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                        {activeSession.strokes || 0}
                      </span>
                    </div>
                    <div className="session-stat">
                      <span className="session-stat-label">Laps</span>
                      <span className="session-stat-value" style={{ color: 'var(--color-exercise)' }}>
                        {activeSession.laps || 0}
                      </span>
                    </div>
                  </>
                )}

                {/* Badminton & Tennis details */}
                {['Badminton', 'Tennis'].includes(activeSession.type) && (
                  <div className="session-stat" style={{ gridColumn: 'span 2' }}>
                    <span className="session-stat-label">Swings</span>
                    <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                      {activeSession.swings || 0}
                    </span>
                  </div>
                )}

                {/* Cycling details */}
                {activeSession.type === 'Cycling' && (
                  <div className="session-stat" style={{ gridColumn: 'span 2' }}>
                    <span className="session-stat-label">Distance</span>
                    <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                      {activeSession.distance || 0} <span style={{ fontSize: '12px' }}>km</span>
                    </span>
                  </div>
                )}

                {/* Yoga details */}
                {activeSession.type === 'Yoga' && (
                  <div className="session-stat" style={{ gridColumn: 'span 2' }}>
                    <span className="session-stat-label">Breaths Logged</span>
                    <span className="session-stat-value" style={{ color: 'var(--color-stand)' }}>
                      {activeSession.breaths || 0}
                    </span>
                  </div>
                )}
              </div>

              {/* Scrolling Heart Rate Line Chart */}
              {(() => {
                const hrPoints = activeSession.heartRateHistory || [];
                const currentHR = activeSession.heartRate || 120;
                
                // Determine HR zone name and styling class
                let zoneName = 'Warm Up';
                let zoneClass = 'hr-zone-fatburn';
                if (currentHR > 150) {
                  zoneName = 'Peak Zone';
                  zoneClass = 'hr-zone-peak';
                } else if (currentHR >= 115) {
                  zoneName = 'Cardio Zone';
                  zoneClass = 'hr-zone-cardio';
                }

                const getHeartRateSVGPath = () => {
                  if (hrPoints.length < 2) return '';
                  const xSpacing = 280 / 14; // max 15 points
                  const yMin = 70;
                  const yMax = 180;
                  const pointsStr = hrPoints.map((hr, index) => {
                    const x = 10 + index * xSpacing;
                    const pct = (hr - yMin) / (yMax - yMin);
                    const y = 60 - Math.min(1, Math.max(0, pct)) * 50; // clamp y between 10 and 60
                    return `${x},${y}`;
                  });
                  return `M ${pointsStr.join(' L ')}`;
                };

                const latestPoint = () => {
                  if (hrPoints.length === 0) return { x: 10, y: 35 };
                  const index = hrPoints.length - 1;
                  const xSpacing = 280 / 14;
                  const hr = hrPoints[index];
                  const x = 10 + index * xSpacing;
                  const pct = (hr - 70) / (180 - 70);
                  const y = 60 - Math.min(1, Math.max(0, pct)) * 50;
                  return { x, y };
                };

                const pt = latestPoint();

                return (
                  <div className="hr-chart-wrapper">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        Live Heart Rate Graph
                      </span>
                      <span className={`hr-zone-badge ${zoneClass}`}>
                        {zoneName}
                      </span>
                    </div>
                    <svg width="100%" height="70" viewBox="0 0 300 70">
                      {/* Grid Lines */}
                      <g className="hr-chart-grid">
                        <line x1="0" y1="10" x2="300" y2="10" />
                        <line x1="0" y1="35" x2="300" y2="35" />
                        <line x1="0" y1="60" x2="300" y2="60" />
                      </g>
                      
                      {/* Heart Rate Graph Line */}
                      {hrPoints.length >= 2 && (
                        <path 
                          d={getHeartRateSVGPath()} 
                          fill="none" 
                          stroke="#ff453a" 
                          strokeWidth="2.5" 
                          className="hr-chart-line" 
                        />
                      )}
                      
                      {/* Pulsing indicator dot on last point */}
                      <circle 
                        cx={pt.x} 
                        cy={pt.y} 
                        r="4.5" 
                        fill="#ff453a" 
                        className="pulse" 
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                );
              })()}
 
              {/* Session Simulator Panel */}
              <div className="glass-panel" style={{ width: '100%', maxWidth: '340px', padding: '14px', margin: '15px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Interactive Session Controls
                  </span>
                  
                  {sensorStatus === 'active' ? (
                    <span style={{ fontSize: '9px', color: 'var(--color-exercise)', fontWeight: 'bold' }}>📡 SENSOR ACTIVE</span>
                  ) : (
                    <button 
                      onClick={requestSensorPermission} 
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        border: 'none',
                        padding: '2px 8px',
                        fontSize: '9px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '700'
                      }}
                    >
                      🔗 CONNECT MOBILE SENSOR
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Sport Specific Interactive simulation controls */}
                  {['Walking', 'Running'].includes(activeSession.type) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="sim-control-btn" 
                          style={{ flex: 1, padding: '8px' }} 
                          onClick={() => handleSessionAddSteps(50)}
                        >
                          🚶 Add 50 Steps
                        </button>
                        <button 
                          className="sim-control-btn" 
                          style={{ flex: 1, padding: '8px' }} 
                          onClick={() => handleSessionAddSteps(200)}
                        >
                          🏃 Add 200 Steps
                        </button>
                      </div>
                      
                      <button 
                        className={`auto-sim-btn ${autoSimActive ? 'active' : ''}`}
                        style={{ padding: '8px', fontSize: '11px' }}
                        onClick={toggleAutoSim}
                      >
                        {autoSimActive ? '⏹ Stop Auto Walk Simulator' : '▶ Start Auto Walk Simulator'}
                      </button>
                    </div>
                  )}

                  {activeSession.type === 'Stair Climbing' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px', color: 'var(--color-exercise)' }} 
                        onClick={handleSessionAddStairsUp}
                      >
                        🪜 Climb Up +1 Floor
                      </button>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px', color: 'var(--color-stand)' }} 
                        onClick={handleSessionAddStairsDown}
                      >
                        🪜 Descend -1 Floor
                      </button>
                    </div>
                  )}

                  {activeSession.type === 'Swimming' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px' }} 
                        onClick={() => handleSessionAddStrokes(10)}
                      >
                        🏊 Stroke +10
                      </button>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px', color: 'var(--color-stand)' }} 
                        onClick={handleSessionAddLap}
                      >
                        🏊 Complete Lap (50m)
                      </button>
                    </div>
                  )}

                  {['Badminton', 'Tennis'].includes(activeSession.type) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px' }} 
                        onClick={() => handleSessionAddSwings(10)}
                      >
                        🏸 Swing +10
                      </button>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px', color: 'var(--color-move)' }} 
                        onClick={() => handleSessionAddSwings(1)}
                      >
                        💥 Play Shot +1
                      </button>
                    </div>
                  )}

                  {activeSession.type === 'Cycling' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px' }} 
                        onClick={handleSessionAddPedals}
                      >
                        🚴 Pedal +500m
                      </button>
                    </div>
                  )}

                  {activeSession.type === 'Yoga' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="sim-control-btn" 
                        style={{ flex: 1, padding: '8px', color: '#bf5af2' }} 
                        onClick={handleSessionAddBreaths}
                      >
                        🧘 Pose Breath +1
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="session-controls">
                {isPaused ? (
                  <button className="session-btn session-btn-resume" onClick={resumeWorkout}>
                    Resume
                  </button>
                ) : (
                  <button className="session-btn session-btn-pause" onClick={pauseWorkout}>
                    Pause
                  </button>
                )}
                <button className="session-btn session-btn-stop" onClick={stopWorkout}>
                  End Workout
                </button>
              </div>
            </div>
          ) : (
            
            /* REGULAR CONTENT (TAB CONTROLLED) */
            <div className="dashboard-content fade-in">
              
              {/* Profile / Greeting */}
              <div className="dashboard-header">
                <div>
                  <div className="date-text">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
                  </div>
                  <div className="welcome-text">
                    {user.isLoggedIn ? `Hi, ${user.name.split(' ')[0]}` : 'Welcome Guest'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="user-profile" onClick={() => {
                    setShowProfileModal(true);
                    setAuthError('');
                  }} style={{ cursor: 'pointer' }}>
                    <div className="user-avatar">
                      {user.isLoggedIn ? getInitials(user.name) : <User size={20} />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Tracking Connection Status Badge */}
              <div className="glass-panel live-tracker-bar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                borderLeft: '4px solid var(--color-exercise)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="live-pulse-dot"></span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    APPLE WATCH CONNECTED
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 'normal' }}>
                    {syncStatus === 'synced' ? '• Cloud Synced' : syncStatus === 'syncing' ? '• Syncing...' : '• Local Mode'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff453a' }}>
                    <Heart size={14} className="pulse" fill="#ff453a" />
                    <span>{currentHeartRate} <span style={{ fontSize: '10px' }}>BPM</span></span>
                  </div>
                  <button 
                    onClick={() => setLiveTracking(prev => !prev)}
                    className="live-toggle-btn"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      color: 'var(--text-secondary)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      transition: 'all 0.2s'
                    }}
                  >
                    {liveTracking ? 'PAUSE LIVE' : 'START LIVE'}
                  </button>
                </div>
              </div>

              {/* TABS */}

              {/* SUMMARY TAB */}
              {activeTab === 'summary' && (
                <>
                  {/* Activity Rings Section */}
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        Daily Activity Rings
                      </span>
                      <button 
                        onClick={() => setShowGoalsEditor(!showGoalsEditor)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-stand)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        {showGoalsEditor ? 'Close' : '✏️ Set Goals'}
                      </button>
                    </div>

                    {showGoalsEditor && (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '8px', animation: 'fadeIn 0.2s' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>MOVE (KCAL)</span>
                          <input 
                            type="number" 
                            value={goals.move} 
                            onChange={e => setGoals(prev => ({ ...prev, move: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>EXERCISE (MIN)</span>
                          <input 
                            type="number" 
                            value={goals.exercise} 
                            onChange={e => setGoals(prev => ({ ...prev, exercise: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>STAND (HRS)</span>
                          <input 
                            type="number" 
                            value={goals.stand} 
                            onChange={e => setGoals(prev => ({ ...prev, stand: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="rings-container">
                      <div className="rings-svg-wrapper">
                        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
                          {/* Track Rings Background */}
                          <circle cx="70" cy="70" r={radiusOuter} fill="transparent" stroke="rgba(255, 27, 85, 0.12)" strokeWidth="10" />
                          <circle cx="70" cy="70" r={radiusMiddle} fill="transparent" stroke="rgba(0, 249, 104, 0.12)" strokeWidth="10" />
                          <circle cx="70" cy="70" r={radiusInner} fill="transparent" stroke="rgba(0, 210, 255, 0.12)" strokeWidth="10" />
                          
                          {/* Live Animated Rings */}
                          <circle 
                            cx="70" cy="70" r={radiusOuter} 
                            fill="transparent" 
                            stroke="url(#moveGrad)" 
                            strokeWidth="10" 
                            strokeDasharray={strokeDashOuter}
                            strokeDashoffset={offsetOuter}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                          />
                          <circle 
                            cx="70" cy="70" r={radiusMiddle} 
                            fill="transparent" 
                            stroke="url(#exerciseGrad)" 
                            strokeWidth="10" 
                            strokeDasharray={strokeDashMiddle}
                            strokeDashoffset={offsetMiddle}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                          />
                          <circle 
                            cx="70" cy="70" r={radiusInner} 
                            fill="transparent" 
                            stroke="url(#standGrad)" 
                            strokeWidth="10" 
                            strokeDasharray={strokeDashInner}
                            strokeDashoffset={offsetInner}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                          />

                          {/* Gradients */}
                          <defs>
                            <linearGradient id="moveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#ff1b55" />
                              <stop offset="100%" stopColor="#ff5e3a" />
                            </linearGradient>
                            <linearGradient id="exerciseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#00f968" />
                              <stop offset="100%" stopColor="#b1f900" />
                            </linearGradient>
                            <linearGradient id="standGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#00d2ff" />
                              <stop offset="100%" stopColor="#0066ff" />
                            </linearGradient>
                          </defs>
                        </svg>
                        
                        {/* Center stats summary icon/preview */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px'
                        }}>
                          <Flame size={18} color="var(--color-move)" />
                        </div>
                      </div>

                      <div className="rings-info">
                        <div className="ring-legend-item">
                          <span className="ring-dot" style={{ backgroundColor: 'var(--color-move)' }}></span>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Move</span>
                            <span style={{ fontWeight: 'bold' }}>{moveCalories} / {goals.move} kcal</span>
                          </div>
                        </div>

                        <div className="ring-legend-item">
                          <span className="ring-dot" style={{ backgroundColor: 'var(--color-exercise)' }}></span>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Exercise</span>
                            <span style={{ fontWeight: 'bold' }}>{exerciseMinutes} / {goals.exercise} min</span>
                          </div>
                        </div>

                        <div className="ring-legend-item">
                          <span className="ring-dot" style={{ backgroundColor: 'var(--color-stand)' }}></span>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Stand/Stairs</span>
                            <span style={{ fontWeight: 'bold' }}>{standHours} / {goals.stand} hr</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Core Metrics Summary Grid */}
                  <div className="summary-grid">
                    <div className="glass-panel summary-card card-move">
                      <span className="card-title">
                        <Flame size={14} color="var(--color-move)" /> Steps Count
                      </span>
                      <span className="card-value">{steps.toLocaleString()}</span>
                      <span className="card-subtext">{(steps * 0.00075).toFixed(2)} km walked</span>
                    </div>

                    <div className="glass-panel summary-card card-exercise">
                      <span className="card-title">
                        <TrendingUp size={14} color="var(--color-exercise)" /> Upstairs
                      </span>
                      <span className="card-value" style={{ color: 'var(--color-exercise)' }}>
                        {stairsUp} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Floors</span>
                      </span>
                      <span className="card-subtext">🚀 Climbing up</span>
                    </div>

                    <div className="glass-panel summary-card card-stand">
                      <span className="card-title">
                        <TrendingDown size={14} color="var(--color-stand)" /> Downstairs
                      </span>
                      <span className="card-value" style={{ color: 'var(--color-stand)' }}>
                        {stairsDown} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Floors</span>
                      </span>
                      <span className="card-subtext">📉 Going down</span>
                    </div>

                    <div className="glass-panel summary-card card-stairs">
                      <span className="card-title">
                        <Activity size={14} color="var(--color-stairs)" /> Calories
                      </span>
                      <span className="card-value" style={{ color: 'var(--color-stairs)' }}>
                        {moveCalories} <span style={{ fontSize: '12px' }}>kcal</span>
                      </span>
                      <span className="card-subtext">Active energy burned</span>
                    </div>
                  </div>

                  {/* Select Activity Tip */}
                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Info size={20} color="var(--color-stand)" />
                    <div style={{ textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong>Real-Time Tracking:</strong> To log steps, stairs climbed, or sports swings, navigate to the <strong>Activities</strong> tab and start a workout. Shaking your mobile device or using session simulators will count metrics only for that active session.
                    </div>
                  </div>

                  {/* Hourly Chart Bar Graph */}
                  <div className="glass-panel chart-card">
                    <div className="chart-header">
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>STEPS BY HOUR</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-move)', fontWeight: 'bold' }}>Live Stats</span>
                    </div>
                    <div className="chart-bars">
                      {hourlySteps.map((item, idx) => (
                        <div key={idx} className="chart-bar-container">
                          <div 
                            className="chart-bar-fill" 
                            style={{ height: `${Math.min(100, (item.count / 1500) * 100)}%`, minHeight: '4px' }}
                          ></div>
                          <span className="chart-bar-label">{item.hour}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Water Tracker Widget */}
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', textAlign: 'left' }}>
                      Hydration Tracker
                    </div>
                    <div className="water-container">
                      <div className="water-wave-box">
                        <div className="water-wave-liquid" style={{ height: `${Math.min(100, (waterIntake / 2000) * 100)}%` }}></div>
                        <div className="water-wave-anim" style={{ top: `-${Math.min(100, (waterIntake / 2000) * 100) + 10}%` }}></div>
                        <span className="water-percentage">{Math.round((waterIntake / 2000) * 100)}%</span>
                      </div>
                      <div className="water-controls-panel">
                        <div style={{ textAlign: 'left' }}>
                          <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{waterIntake} ml</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Daily Target: 2,000 ml (2L)</span>
                        </div>
                        <div className="water-btn-row">
                          <button className="water-add-btn" onClick={() => setWaterIntake(prev => prev + 250)}>
                            💧 +250ml
                          </button>
                          <button className="water-add-btn" onClick={() => setWaterIntake(prev => prev + 500)}>
                            🍼 +500ml
                          </button>
                        </div>
                        <button className="water-reset-btn" onClick={() => setWaterIntake(0)}>
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Achievements Preview */}
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>TODAY'S BADGES</span>
                      <span style={{ fontSize: '11px', color: '#ffd60a', fontWeight: 'bold' }}>
                        {Object.values(badges).filter(Boolean).length} / {Object.keys(badges).length} Unlocked
                      </span>
                    </div>
                    
                    <div className="achievements-grid">
                      <div className={`badge-card ${badges.earlyBird ? 'unlocked' : ''}`}>
                        <div className="badge-icon">🏃</div>
                        <span className="badge-name">Early Walker</span>
                        <span className="badge-desc">1k+ Steps Today</span>
                      </div>
                      
                      <div className={`badge-card ${badges.stairMaster ? 'unlocked' : ''}`}>
                        <div className="badge-icon" style={{ background: 'linear-gradient(135deg, #00f968, #b1f900)' }}>🪜</div>
                        <span className="badge-name">Stair Master</span>
                        <span className="badge-desc">10 Floors Climbed</span>
                      </div>

                      <div className={`badge-card ${badges.superStep ? 'unlocked' : ''}`}>
                        <div className="badge-icon" style={{ background: 'linear-gradient(135deg, #00d2ff, #0066ff)' }}>🏆</div>
                        <span className="badge-name">Super Step</span>
                        <span className="badge-desc">10k+ Daily Steps</span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={resetDailyProgress}
                    style={{
                      background: 'rgba(255, 69, 58, 0.15)',
                      color: '#ff453a',
                      border: '1px solid rgba(255, 69, 58, 0.3)',
                      padding: '12px',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      width: '100%'
                    }}
                  >
                    Clear All Saved Stats
                  </button>
                </>
              )}

              {/* WORKOUTS TAB */}
              {activeTab === 'workouts' && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ textAlign: 'left', marginBottom: '8px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Fitness Tools</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Select a tool to begin real-time session tracking.</p>
                  </div>

                  <div className="workout-list">
                    {workoutsList.map((workout, idx) => (
                      <div 
                        key={idx} 
                        className="glass-panel workout-item"
                        onClick={() => startWorkout(workout)}
                      >
                        <div className="workout-item-left">
                          <div className="workout-icon-box" style={{ background: workout.color }}>
                            <span style={{ fontSize: '22px' }}>{workout.icon}</span>
                          </div>
                          <div className="workout-details">
                            <span className="workout-name">{workout.type}</span>
                            <span className="workout-desc">Est. {workout.calorieBurnRate} kcal/min • Heart rate active</span>
                          </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TOOLS TAB */}
              {activeTab === 'tools' && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ textAlign: 'left', marginBottom: '4px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Calculators & Planners</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Interactive tools to optimize your fitness goals.</p>
                  </div>

                  <div className="tools-grid">
                    {/* BMI Calculator */}
                    <div className="glass-panel tool-card">
                      <span className="tool-title">
                        <Calculator size={16} color="var(--color-stand)" /> BMI Calculator
                      </span>
                      <form className="tool-form" onSubmit={calculateBMI}>
                        <div className="tool-input-row">
                          <div className="tool-input-col">
                            <span className="tool-label">Height (cm)</span>
                            <input 
                              type="number" 
                              required 
                              placeholder="175"
                              className="tool-input"
                              value={bmiInput.height}
                              onChange={e => setBmiInput({...bmiInput, height: e.target.value})}
                            />
                          </div>
                          <div className="tool-input-col">
                            <span className="tool-label">Weight (kg)</span>
                            <input 
                              type="number" 
                              required 
                              placeholder="70" 
                              className="tool-input"
                              value={bmiInput.weight}
                              onChange={e => setBmiInput({...bmiInput, weight: e.target.value})}
                            />
                          </div>
                        </div>
                        <button type="submit" className="tool-btn">Calculate BMI</button>
                      </form>
                      {bmiResult && (
                        <div className="tool-result">
                          BMI Score: <strong>{bmiResult.score}</strong> ({bmiResult.desc})
                        </div>
                      )}
                    </div>

                    {/* Pace Calculator */}
                    <div className="glass-panel tool-card">
                      <span className="tool-title">
                        <Timer size={16} color="var(--color-exercise)" /> Pace Calculator
                      </span>
                      <form className="tool-form" onSubmit={calculatePace}>
                        <div className="tool-input-row">
                          <div className="tool-input-col">
                            <span className="tool-label">Distance (km)</span>
                            <input 
                              type="number" 
                              step="0.1"
                              required 
                              placeholder="5" 
                              className="tool-input"
                              value={paceInput.distance}
                              onChange={e => setPaceInput({...paceInput, distance: e.target.value})}
                            />
                          </div>
                          <div className="tool-input-col">
                            <span className="tool-label">Time (minutes)</span>
                            <input 
                              type="number" 
                              required 
                              placeholder="25" 
                              className="tool-input"
                              value={paceInput.time}
                              onChange={e => setPaceInput({...paceInput, time: e.target.value})}
                            />
                          </div>
                        </div>
                        <button type="submit" className="tool-btn">Calculate Pace</button>
                      </form>
                      {paceResult && (
                        <div className="tool-result">
                          Pace Required: <strong>{paceResult}</strong>
                        </div>
                      )}
                    </div>

                    {/* Calorie Target Planner */}
                    <div className="glass-panel tool-card" style={{ gridColumn: 'span 1' }}>
                      <span className="tool-title">
                        <Flame size={16} color="var(--color-move)" /> Target Calorie Planner
                      </span>
                      <form className="tool-form" onSubmit={calculateCalorieTarget}>
                        <div className="tool-input-col">
                          <span className="tool-label">Weight (kg)</span>
                          <input 
                            type="number" 
                            required 
                            placeholder="70" 
                            className="tool-input"
                            value={calorieInput.weight}
                            onChange={e => setCalorieInput({...calorieInput, weight: e.target.value})}
                          />
                        </div>
                        <div className="tool-input-row">
                          <div className="tool-input-col">
                            <span className="tool-label">Goal</span>
                            <select 
                              className="tool-input"
                              value={calorieInput.goal}
                              onChange={e => setCalorieInput({...calorieInput, goal: e.target.value})}
                              style={{ background: '#1c1c1e', color: '#fff' }}
                            >
                              <option value="loss">Weight Loss</option>
                              <option value="maintain">Maintenance</option>
                              <option value="gain">Weight Gain</option>
                            </select>
                          </div>
                          <div className="tool-input-col">
                            <span className="tool-label">Activity Multiplier</span>
                            <select 
                              className="tool-input"
                              value={calorieInput.activity}
                              onChange={e => setCalorieInput({...calorieInput, activity: e.target.value})}
                              style={{ background: '#1c1c1e', color: '#fff' }}
                            >
                              <option value="1.2">Sedentary (1.2)</option>
                              <option value="1.375">Lightly Active (1.375)</option>
                              <option value="1.55">Moderately Active (1.55)</option>
                              <option value="1.725">Highly Active (1.725)</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" className="tool-btn">Calculate Daily Target</button>
                      </form>
                      {calorieResult && (
                        <div className="tool-result" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span>Daily Maintenance (TDEE): <strong>{calorieResult.tdee} kcal</strong></span>
                          <span>Target Recommendation: <strong style={{ color: 'var(--color-move)' }}>{calorieResult.target} kcal/day</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* HISTORY / LOGS TAB */}
              {activeTab === 'history' && (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Workout Logs</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <History size={14} /> Historical
                    </span>
                  </div>

                  <div className="history-list">
                    {workoutLogs.length === 0 ? (
                      <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No workouts tracked yet. Go to Workouts to start!
                      </div>
                    ) : (
                      workoutLogs.map((log) => (
                        <div key={log.id} className="history-card">
                          <div className="history-left">
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(255,255,255,0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <span style={{ fontSize: '18px' }}>{log.icon || '🏃'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                              <strong style={{ fontSize: '13px' }}>{log.type} Workout</strong>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{log.date}</span>
                            </div>
                          </div>

                          <div className="history-right">
                            <span style={{ color: 'var(--color-move)', fontWeight: 'bold', fontSize: '13px' }}>
                              +{log.calories} kcal
                            </span>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              {log.duration} min • {log.customMetric || `${log.heartRate || 120} bpm`}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Weekly Trends Card */}
                  <div className="glass-panel trends-chart-wrapper" style={{ padding: '16px', textAlign: 'left' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      Weekly Activity Trends
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                      Move (Pink) • Exercise (Green) • Stand (Blue) completion %
                    </span>
                    <div className="trends-bars-container">
                      {[
                        { day: 'M', move: 70, exercise: 80, stand: 55 },
                        { day: 'T', move: 95, exercise: 90, stand: 70 },
                        { day: 'W', move: 60, exercise: 50, stand: 45 },
                        { day: 'T', move: 85, exercise: 100, stand: 80 },
                        { day: 'F', move: 110, exercise: 120, stand: 95 },
                        { day: 'S', move: 120, exercise: 130, stand: 100 },
                        { day: 'S', move: 90, exercise: 85, stand: 75 }
                      ].map((item, idx) => (
                        <div key={idx} className="trend-column">
                          <div className="trend-bars-stacked">
                            <div className="trend-bar" style={{ height: `${item.move}%`, background: 'var(--color-move)' }}></div>
                            <div className="trend-bar" style={{ height: `${item.exercise}%`, background: 'var(--color-exercise)' }}></div>
                            <div className="trend-bar" style={{ height: `${item.stand}%`, background: 'var(--color-stand)' }}></div>
                          </div>
                          <span className="trend-label">{item.day}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lifetime Statistics */}
                  <div className="glass-panel" style={{ padding: '16px', textAlign: 'left' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                      Lifetime Stats
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block' }}>TOTAL WORKOUTS</span>
                        <strong style={{ fontSize: '18px' }}>{workoutLogs.length} Sessions</strong>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block' }}>TOTAL CALORIES BURNED</span>
                        <strong style={{ fontSize: '18px', color: 'var(--color-move)' }}>{workoutCalories} kcal</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Nav Tab Bar */}
          {!activeSession && (
            <div className="nav-tab-bar">
              <button 
                className={`nav-tab ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveTab('summary')}
              >
                <Activity size={20} />
                <span>Summary</span>
              </button>
              <button 
                className={`nav-tab ${activeTab === 'workouts' ? 'active' : ''}`}
                onClick={() => setActiveTab('workouts')}
                style={{ color: activeTab === 'workouts' ? 'var(--color-exercise)' : '' }}
              >
                <Trophy size={20} />
                <span>Fitness Tools</span>
              </button>
              <button 
                className={`nav-tab ${activeTab === 'tools' ? 'active' : ''}`}
                onClick={() => setActiveTab('tools')}
                style={{ color: activeTab === 'tools' ? 'var(--color-stand)' : '' }}
              >
                <Calculator size={20} />
                <span>Calculators</span>
              </button>
              <button 
                className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
                style={{ color: activeTab === 'history' ? '#ffd60a' : '' }}
              >
                <History size={20} />
                <span>History</span>
              </button>
            </div>
          )}

          {/* User Profile / Login Modal */}
          {showProfileModal && (
            <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
              <div className="glass-panel modal-card fade-in" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setShowProfileModal(false)}>
                  &times;
                </button>
                
                {user.isLoggedIn ? (
                  <div className="profile-card-details">
                    <div className="profile-avatar-large">
                      {getInitials(user.name)}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{user.name}</h3>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{user.email}</span>
                    </div>

                    <div className="profile-stats-grid">
                      <div className="profile-stat-box">
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>STEPS TODAY</span>
                        <span className="profile-stat-val" style={{ color: 'var(--color-exercise)' }}>{steps.toLocaleString()}</span>
                      </div>
                      <div className="profile-stat-box">
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>CALORIES</span>
                        <span className="profile-stat-val" style={{ color: 'var(--color-move)' }}>{moveCalories} kcal</span>
                      </div>
                      <div className="profile-stat-box">
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>UPSTAIRS</span>
                        <span className="profile-stat-val" style={{ color: 'var(--color-exercise)' }}>{stairsUp} F</span>
                      </div>
                      <div className="profile-stat-box">
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>WORKOUTS</span>
                        <span className="profile-stat-val" style={{ color: 'var(--color-stairs)' }}>{workoutLogs.length}</span>
                      </div>
                    </div>

                    {/* Goal Configuration inside Profile Details Modal */}
                    <div style={{ width: '100%', borderTop: '1px solid var(--border-light)', paddingTop: '16px', textAlign: 'left' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                        Edit Daily Targets
                      </span>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>MOVE (KCAL)</span>
                          <input 
                            type="number" 
                            value={goals.move} 
                            onChange={e => setGoals(prev => ({ ...prev, move: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>EXERCISE (MIN)</span>
                          <input 
                            type="number" 
                            value={goals.exercise} 
                            onChange={e => setGoals(prev => ({ ...prev, exercise: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>STAND (HRS)</span>
                          <input 
                            type="number" 
                            value={goals.stand} 
                            onChange={e => setGoals(prev => ({ ...prev, stand: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                            className="auth-input" 
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      className="auth-btn" 
                      style={{ 
                        width: '100%', 
                        background: 'rgba(255, 69, 58, 0.15)', 
                        color: '#ff453a', 
                        border: '1px solid rgba(255, 69, 58, 0.3)', 
                        boxShadow: 'none' 
                      }} 
                      onClick={handleLogout}
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="auth-header">
                      <h3 className="auth-title">{authMode === 'login' ? 'Sign In' : 'Create Account'}</h3>
                      <p className="auth-subtitle">Sync your Apple Fitness rings & logs to your account</p>
                    </div>
                    
                    {authError && (
                      <div style={{
                        background: 'rgba(255, 69, 58, 0.12)',
                        color: '#ff453a',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        marginBottom: '14px',
                        textAlign: 'center',
                        fontWeight: '500',
                        border: '1px solid rgba(255, 69, 58, 0.25)',
                        lineHeight: '1.4'
                      }}>
                        {authError}
                      </div>
                    )}

                    <form className="auth-form" onSubmit={handleAuthSubmit}>
                      {authMode === 'signup' && (
                        <div className="auth-field">
                          <label className="tool-label">Full Name</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="John Doe" 
                            className="auth-input"
                            value={authName}
                            onChange={e => setAuthName(e.target.value)}
                          />
                        </div>
                      )}
                      
                      <div className="auth-field">
                        <label className="tool-label">Email Address</label>
                        <input 
                          type="email" 
                          required 
                          placeholder="john@example.com" 
                          className="auth-input"
                          value={authEmail}
                          onChange={e => setAuthEmail(e.target.value)}
                        />
                      </div>
                      
                      <div className="auth-field">
                        <label className="tool-label">Password</label>
                        <input 
                          type="password" 
                          required 
                          placeholder="••••••••" 
                          className="auth-input"
                          value={authPassword}
                          onChange={e => setAuthPassword(e.target.value)}
                        />
                      </div>
                      
                      <button type="submit" className="auth-btn" style={{ marginTop: '10px' }}>
                        {authMode === 'login' ? 'Sign In with Email' : 'Register Account'}
                      </button>
                    </form>

                    <p className="auth-toggle-text">
                      {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                      <span className="auth-toggle-link" onClick={() => {
                        setAuthMode(authMode === 'login' ? 'signup' : 'login');
                        setAuthError('');
                      }}>
                        {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                      </span>
                    </p>

                    <div className="social-auth">
                      <button className="social-btn" onClick={handleGoogleSignIn} style={{ width: '100%' }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: '8px' }}>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        {authMode === 'login' ? 'Sign In with Google' : 'Sign Up with Google'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      );
    }
