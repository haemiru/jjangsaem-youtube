import { auth, db, storage } from '../firebase';
import { signInAnonymously as firebaseSignInAnon, onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

const PROJECTS_COL = 'projects';

// Firestore doesn't support nested arrays. Serialize complex sections as JSON strings.
const JSON_FIELDS = ['plan', 'benchmark', 'script', 'metadata', 'upload', 'seriesPlan'];

function serializeForFirestore(data) {
  const out = { ...data };
  for (const key of JSON_FIELDS) {
    if (out[key] !== undefined) {
      out[key] = JSON.stringify(out[key]);
    }
  }
  return out;
}

function deserializeFromFirestore(data) {
  const out = { ...data };
  for (const key of JSON_FIELDS) {
    if (typeof out[key] === 'string') {
      try { out[key] = JSON.parse(out[key]); } catch {}
    }
  }
  return out;
}

// --- Auth ---
export function signInAnon() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user.uid);
      }
    });
    firebaseSignInAnon(auth).catch((err) => {
      unsub();
      reject(err);
    });
  });
}

// --- Projects CRUD ---
export async function createProject(uid, name, initialState) {
  const serialized = serializeForFirestore({
    plan: initialState.plan,
    benchmark: initialState.benchmark,
    script: initialState.script,
    metadata: initialState.metadata,
    upload: initialState.upload,
    seriesPlan: initialState.seriesPlan,
  });
  const docRef = await addDoc(collection(db, PROJECTS_COL), {
    uid,
    name,
    activeTab: 'plan',
    ...serialized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function listProjects(uid) {
  const q = query(
    collection(db, PROJECTS_COL),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map(d => deserializeFromFirestore({ id: d.id, ...d.data() }));
  // Sort client-side to avoid composite index requirement
  list.sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() || 0;
    const tb = b.updatedAt?.toMillis?.() || 0;
    return tb - ta;
  });
  return list;
}

export async function loadProject(projectId) {
  const snap = await getDoc(doc(db, PROJECTS_COL, projectId));
  if (!snap.exists()) return null;
  return deserializeFromFirestore({ id: snap.id, ...snap.data() });
}

export async function saveProject(projectId, data) {
  const serialized = serializeForFirestore(data);
  await setDoc(doc(db, PROJECTS_COL, projectId), {
    ...serialized,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteProject(projectId) {
  await deleteDoc(doc(db, PROJECTS_COL, projectId));
}

export async function renameProject(projectId, newName) {
  await setDoc(doc(db, PROJECTS_COL, projectId), {
    name: newName,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// --- Character Image Upload ---
export async function uploadCharacterImage(projectId, base64DataUrl) {
  const storageRef = ref(storage, `characters/${projectId}.png`);
  await uploadString(storageRef, base64DataUrl, 'data_url');
  return getDownloadURL(storageRef);
}
