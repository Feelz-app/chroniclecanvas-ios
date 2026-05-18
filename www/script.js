import { auth, db, storage, functions, appCheck } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut
} from "firebase/auth";

import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  deleteField,
  writeBatch
} from "firebase/firestore";
import {
  httpsCallable
} from "firebase/functions";
import {
  getToken as getAppCheckToken
} from "firebase/app-check";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";

window.addEventListener("DOMContentLoaded", () => {
  const defaultFolders = [
    { value: "general", label: "General" },
    { value: "vehicle", label: "Vehicle" },
    { value: "job", label: "Job" },
    { value: "housing", label: "Housing" }
  ];
  const planLimits = {
    free: {
      label: "Starter",
      price: "$0",
      shareLimit: 0,
      eventLimit: 25,
      folderLimit: 3,
      storageLimitBytes: 0,
      maxFileSizeBytes: 0,
      exports: false,
      storyPrint: true,
      description: "Start your timeline and feel the value before paying.",
      features: ["25 milestones", "3 folders", "No file attachments", "Basic story view"]
    },
    family: {
      label: "Home",
      price: "$7/mo",
      shareLimit: 1,
      eventLimit: 1000,
      folderLimit: 25,
      storageLimitBytes: 5 * 1024 * 1024 * 1024,
      maxFileSizeBytes: 25 * 1024 * 1024,
      exports: true,
      storyPrint: true,
      description: "For a household keeping family, vehicle, and everyday records in one shareable place.",
      features: ["1,000 milestones", "25 folders", "5 GB attachments", "Share with 1 authorized user", "Exports included"]
    },
    advanced: {
      label: "Advanced",
      price: "$25/mo",
      shareLimit: 3,
      eventLimit: 10000,
      folderLimit: 100,
      storageLimitBytes: 50 * 1024 * 1024 * 1024,
      maxFileSizeBytes: 100 * 1024 * 1024,
      exports: true,
      storyPrint: true,
      description: "For heavier records, larger files, shared family logistics, and deeper documentation workflows.",
      features: ["10,000 milestones", "100 folders", "50 GB attachments", "Share with up to 3 authorized users", "Large file uploads"],
      noteLabel: "Business Lite",
      noteHint: "Good for sole proprietor businesses and single-user business use until full Business launches."
    },
    businessComingSoon: {
      label: "Business",
      price: "Coming soon",
      eventLimit: 0,
      folderLimit: 0,
      storageLimitBytes: 0,
      maxFileSizeBytes: 0,
      exports: false,
      storyPrint: false,
      description: "For teams with owner-managed member logins, shared records, and multi-user account control.",
      features: ["Multi-user workspace", "Main user manages member access", "Shared records and accountability", "Built for team operations"],
      comingSoon: true
    }
  };
  const defaultDashboardPreferences = {
    showMetrics: true,
    showPlanCards: true,
    showInsights: true,
    showPrompts: true,
    showUpcoming: true,
    showRecent: true,
    showFolders: true
  };
  const defaultComposerPreferences = {
    showSummary: true,
    showEndDate: true,
    showReminderDate: true,
    showLocation: true,
    showAmount: true,
    showPeople: true,
    showTags: true,
    showExternalLink: true,
    showNotes: true,
    summaryLabel: "Summary",
    locationLabel: "Location",
    amountLabel: "Amount / Value",
    peopleLabel: "People",
    tagsLabel: "Tags",
    externalLinkLabel: "Reference Link",
    notesLabel: "Notes"
  };
  const deletionBucketLabels = {
    events: "Timeline events",
    trash: "Trash",
    attachments: "Uploaded files",
    dashboard: "Dashboard layout",
    composer: "Composer layout",
    sharing: "Authorized users"
  };

  let user = null;
  let events = [];
  let trash = [];
  let customFolders = [];
  let dashboardPreferences = { ...defaultDashboardPreferences };
  let composerPreferences = { ...defaultComposerPreferences };
  let activeFolder = "all";
  let selectedColor = "#5ea0ff";
  let editingId = null;
  let attachingEventId = null;
  let attachingSectionId = null;
  let draggedEventId = null;
  let colorWheel = null;
  let selectedAttachments = [];
  let selectedSections = [];
  let selectedCustomFields = [];
  let folderDocUnsubscribe = null;
  let dashboardDocUnsubscribe = null;
  let composerDocUnsubscribe = null;
  let userProfileUnsubscribe = null;
  let eventsUnsubscribe = null;
  let trashUnsubscribe = null;
  let userProfile = { plan: "free" };
  let workspaceProfile = null;
  let workspaceOwnerUid = "";
  let editingAuthorizedUserEmail = "";
  let activeSection = "dashboard";
  let activeViewGraph = "table";
  let activeDrawerEventId = null;
  let searchQuery = "";
  let statusFilter = "all";
  let sortMode = "custom";
  let appListenersReady = false;
  let creatorClaimAttempted = false;
  let authorizedWorkspaceClaimAttempted = false;
  let attachingSubEventId = null;
  let drawerSectionDrafts = {};
  let suppressDrawerOpenUntil = 0;
  const attachmentUrlCache = new Map();
  let workspaceProfileUnsubscribe = null;
  let selectedVisibleToEmails = [];

  const loginContainer = document.getElementById("loginContainer");
  const app = document.getElementById("app");
  const loginModeBtn = document.getElementById("loginModeBtn");
  const signupModeBtn = document.getElementById("signupModeBtn");
  const authModeCopy = document.getElementById("authModeCopy");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const authStatus = document.getElementById("authStatus");
  const dashboardTab = document.getElementById("dashboardTab");
  const timelineTab = document.getElementById("timelineTab");
  const viewsTab = document.getElementById("viewsTab");
  const storyTab = document.getElementById("storyTab");
  const trashTab = document.getElementById("trashTab");
  const settingsTab = document.getElementById("settingsTab");
  const logoutBtn = document.getElementById("logoutBtn");
  const main = document.getElementById("main");
  const dashboardView = document.getElementById("dashboardView");
  const timelineView = document.getElementById("timelineView");
  const viewsView = document.getElementById("viewsView");
  const storyView = document.getElementById("storyView");
  const trashView = document.getElementById("trashView");
  const settingsView = document.getElementById("settingsView");
  const settingsHero = document.getElementById("settingsHero");
  const settingsArrivalBadge = document.getElementById("settingsArrivalBadge");
  const currentPasswordInput = document.getElementById("currentPasswordInput");
  const newPasswordInput = document.getElementById("newPasswordInput");
  const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const deleteDataOptionsGrid = document.getElementById("deleteDataOptionsGrid");
  const deleteDataRoleHint = document.getElementById("deleteDataRoleHint");
  const deleteSelectedDataBtn = document.getElementById("deleteSelectedDataBtn");
  const deleteDataPageLink = document.getElementById("deleteDataPageLink");
  const deleteAccountPageLink = document.getElementById("deleteAccountPageLink");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  const deleteAccountReasonInput = document.getElementById("deleteAccountReasonInput");
  const deleteAccountImprovementInput = document.getElementById("deleteAccountImprovementInput");
  const searchInput = document.getElementById("searchInput");
  const statusFilterInput = document.getElementById("statusFilter");
  const sortSelect = document.getElementById("sortSelect");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const statusBanner = document.getElementById("statusBanner");
  const sectionArrivalToast = document.getElementById("sectionArrivalToast");
  const addBtn = document.getElementById("addBtn");
  const selectFilesBtn = document.getElementById("selectFilesBtn");
  const addFolderBtn = document.getElementById("addFolderBtn");
  const newFolderInput = document.getElementById("newFolderInput");
  const title = document.getElementById("title");
  const summary = document.getElementById("summary");
  const notes = document.getElementById("notes");
  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const reminderDate = document.getElementById("reminderDate");
  const folderSelect = document.getElementById("folderSelect");
  const statusSelectInput = document.getElementById("statusSelectInput");
  const locationInput = document.getElementById("location");
  const amountInput = document.getElementById("amount");
  const peopleInput = document.getElementById("people");
  const tagsInput = document.getElementById("tags");
  const externalLinkInput = document.getElementById("externalLink");
  const folderButtonList = document.getElementById("folderButtonList");
  const folderCountPill = document.getElementById("folderCountPill");
  const planStatus = document.getElementById("planStatus");
  const sidebarPrompts = document.getElementById("sidebarPrompts");
  const timeline = document.getElementById("timeline");
  const tableBody = document.getElementById("tableBody");
  const verticalTimeline = document.getElementById("verticalTimeline");
  const spotlightGraph = document.getElementById("spotlightGraph");
  const metricsGrid = document.getElementById("metricsGrid");
  const upgradePanel = document.getElementById("upgradePanel");
  const settingsPlanPanel = document.getElementById("settingsPlanPanel");
  const insightCards = document.getElementById("insightCards");
  const dashboardPrompts = document.getElementById("dashboardPrompts");
  const upcomingList = document.getElementById("upcomingList");
  const recentList = document.getElementById("recentList");
  const folderOverview = document.getElementById("folderOverview");
  const dashboardHeadline = document.getElementById("dashboardHeadline");
  const dashboardSubcopy = document.getElementById("dashboardSubcopy");
  const jumpToComposerBtn = document.getElementById("jumpToComposerBtn");
  const openStoryBtn = document.getElementById("openStoryBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const printStoryBtn = document.getElementById("printStoryBtn");
  const copyStoryBtn = document.getElementById("copyStoryBtn");
  const storyHighlights = document.getElementById("storyHighlights");
  const storyScene = document.getElementById("storyScene");
  const storyHeadline = document.getElementById("storyHeadline");
  const trashList = document.getElementById("trashList");
  const colorInput = document.getElementById("color");
  const attachmentInput = document.getElementById("attachmentInput");
  const attachmentPreview = document.getElementById("attachmentPreview");
  const customFieldsList = document.getElementById("customFieldsList");
  const addCustomFieldBtn = document.getElementById("addCustomFieldBtn");
  const insightsPanel = document.getElementById("insightsPanel");
  const promptsPanel = document.getElementById("promptsPanel");
  const upcomingPanel = document.getElementById("upcomingPanel");
  const recentPanel = document.getElementById("recentPanel");
  const folderPulsePanel = document.getElementById("folderPulsePanel");
  const resetDashboardLayoutBtn = document.getElementById("resetDashboardLayoutBtn");
  const dashboardLayoutCount = document.getElementById("dashboardLayoutCount");
  const toggleMetrics = document.getElementById("toggleMetrics");
  const togglePlanCards = document.getElementById("togglePlanCards");
  const toggleInsights = document.getElementById("toggleInsights");
  const togglePrompts = document.getElementById("togglePrompts");
  const toggleUpcoming = document.getElementById("toggleUpcoming");
  const toggleRecent = document.getElementById("toggleRecent");
  const toggleFolders = document.getElementById("toggleFolders");
  const summaryGroup = document.getElementById("summaryGroup");
  const endDateGroup = document.getElementById("endDateGroup");
  const reminderDateGroup = document.getElementById("reminderDateGroup");
  const locationGroup = document.getElementById("locationGroup");
  const amountGroup = document.getElementById("amountGroup");
  const peopleGroup = document.getElementById("peopleGroup");
  const tagsGroup = document.getElementById("tagsGroup");
  const externalLinkGroup = document.getElementById("externalLinkGroup");
  const notesGroup = document.getElementById("notesGroup");
  const summaryLabel = document.getElementById("summaryLabel");
  const locationLabel = document.getElementById("locationLabel");
  const amountLabel = document.getElementById("amountLabel");
  const peopleLabel = document.getElementById("peopleLabel");
  const tagsLabel = document.getElementById("tagsLabel");
  const externalLinkLabel = document.getElementById("externalLinkLabel");
  const notesLabel = document.getElementById("notesLabel");
  const toggleComposerSummary = document.getElementById("toggleComposerSummary");
  const toggleComposerEndDate = document.getElementById("toggleComposerEndDate");
  const toggleComposerReminder = document.getElementById("toggleComposerReminder");
  const toggleComposerLocation = document.getElementById("toggleComposerLocation");
  const toggleComposerAmount = document.getElementById("toggleComposerAmount");
  const toggleComposerPeople = document.getElementById("toggleComposerPeople");
  const toggleComposerTags = document.getElementById("toggleComposerTags");
  const toggleComposerLink = document.getElementById("toggleComposerLink");
  const toggleComposerNotes = document.getElementById("toggleComposerNotes");
  const summaryLabelInput = document.getElementById("summaryLabelInput");
  const locationLabelInput = document.getElementById("locationLabelInput");
  const amountLabelInput = document.getElementById("amountLabelInput");
  const peopleLabelInput = document.getElementById("peopleLabelInput");
  const tagsLabelInput = document.getElementById("tagsLabelInput");
  const externalLinkLabelInput = document.getElementById("externalLinkLabelInput");
  const notesLabelInput = document.getElementById("notesLabelInput");
  const resetComposerLayoutBtn = document.getElementById("resetComposerLayoutBtn");
  const composerLayoutCount = document.getElementById("composerLayoutCount");
  const attachmentHealthPanel = document.getElementById("attachmentHealthPanel");
  const visibilitySection = document.getElementById("visibilitySection");
  const visibilitySummary = document.getElementById("visibilitySummary");
  const visibilityChecklist = document.getElementById("visibilityChecklist");
  const authorizedUsersPanel = document.getElementById("authorizedUsersPanel");
  const authorizedUsersSummary = document.getElementById("authorizedUsersSummary");
  const authorizedUsersEditor = document.getElementById("authorizedUsersEditor");
  const authorizedUserEmailInput = document.getElementById("authorizedUserEmailInput");
  const addAuthorizedUserBtn = document.getElementById("addAuthorizedUserBtn");
  const authorizedUsersList = document.getElementById("authorizedUsersList");
  let authMode = "login";
  const inviteParams = getInviteParams();

  setupAuthMode();

  loginBtn.onclick = async () => {
    const emailValue = normalizeEmail(email.value);
    const passwordValue = password.value;

    if (!emailValue || !passwordValue) {
      setStatus("Enter both an email and password.", "error");
      return;
    }

    await withBusy(loginBtn, "Logging In...", async () => {
      await signInWithEmailAndPassword(auth, emailValue, passwordValue);
      setStatus("Logged in successfully.", "success");
    });
  };

  signupBtn.onclick = async () => {
    const emailValue = normalizeEmail(email.value);
    const passwordValue = password.value;
    const confirmPasswordValue = confirmPassword.value;

    if (!emailValue || !passwordValue || !confirmPasswordValue) {
      setStatus("Enter your email, password, and retyped password to create an account.", "error");
      return;
    }

    if (passwordValue.length < 6) {
      setStatus("Use a password with at least 6 characters.", "error");
      return;
    }

    if (passwordValue !== confirmPasswordValue) {
      setStatus("Those passwords do not match yet. Please retype them.", "error");
      confirmPassword.focus();
      return;
    }

    await withBusy(signupBtn, "Creating...", async () => {
      await createUserWithEmailAndPassword(auth, emailValue, passwordValue);
      setStatus("Account created successfully.", "success");
    });
  };

  resetPasswordBtn.onclick = async () => {
    const emailValue = normalizeEmail(email.value);

    if (!emailValue) {
      setStatus("Enter your email first so a reset link knows where to go.", "error");
      return;
    }

    await withBusy(resetPasswordBtn, "Sending...", async () => {
      await sendPasswordResetEmail(auth, emailValue);
      setStatus("Password reset email sent.", "success");
    });
  };

  logoutBtn.onclick = async () => {
    await withBusy(logoutBtn, "Logging Out...", async () => {
      await signOut(auth);
    });
  };

  onAuthStateChanged(auth, (nextUser) => {
    if (!nextUser) {
      resetAppState();
      loginContainer.style.display = "flex";
      app.style.display = "none";
      setAuthMode("login");
      return;
    }

    user = nextUser;
    customFolders = [];
    userProfile = { plan: "free" };
    workspaceProfile = null;
    workspaceOwnerUid = nextUser.uid;

    loginContainer.style.display = "none";
    app.style.display = "flex";

    subscribeToUserProfile();
    subscribeToDashboardProfile();
    subscribeToComposerProfile();
    setupAppListeners();
    renderFolderControls();
    resetForm();
    void warmAppCheck();
  });

  function setupAppListeners() {
    if (appListenersReady) return;

    appListenersReady = true;
    setupTabs();
    setupFilters();
    setupViewSwitches();
    setupColorPicker();
    setupAttachmentPicker();
    setupFolderCreator();
    setupStoryActions();
    setupDashboardCustomization();
    setupComposerCustomization();
    setupCustomFieldEditor();
    setupSecurityControls();
    setupDeletionControls();
    setupSharingControls();
  }

  function setupAuthMode() {
    loginModeBtn.onclick = () => setAuthMode("login");
    signupModeBtn.onclick = () => setAuthMode("signup");

    [email, password, confirmPassword].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        event.preventDefault();
        if (authMode === "signup") {
          signupBtn.click();
          return;
        }

        loginBtn.click();
      });
    });

    setAuthMode(inviteParams.mode === "signup" ? "signup" : "login");
    applyInviteAuthState();
  }

  function setupSecurityControls() {
    if (!changePasswordBtn || !currentPasswordInput || !newPasswordInput || !confirmNewPasswordInput) return;

    const submitPasswordChange = async () => {
      if (!user?.email) {
        setStatus("You need to be signed in with an email account to change your password.", "error");
        return;
      }

      const currentPasswordValue = currentPasswordInput.value;
      const nextPasswordValue = newPasswordInput.value;
      const confirmPasswordValue = confirmNewPasswordInput.value;

      if (!currentPasswordValue || !nextPasswordValue || !confirmPasswordValue) {
        setStatus("Enter your current password, then type your new password twice.", "error");
        return;
      }

      if (nextPasswordValue.length < 6) {
        setStatus("Use a new password with at least 6 characters.", "error");
        return;
      }

      if (nextPasswordValue !== confirmPasswordValue) {
        setStatus("Those new passwords do not match yet. Please retype them.", "error");
        confirmNewPasswordInput.focus();
        return;
      }

      if (currentPasswordValue === nextPasswordValue) {
        setStatus("Choose a different new password so the change actually protects the account.", "error");
        newPasswordInput.focus();
        return;
      }

      await withBusy(changePasswordBtn, "Updating...", async () => {
        try {
          const credential = EmailAuthProvider.credential(user.email, currentPasswordValue);
          await reauthenticateWithCredential(user, credential);
          await updatePassword(user, nextPasswordValue);
          currentPasswordInput.value = "";
          newPasswordInput.value = "";
          confirmNewPasswordInput.value = "";
          setStatus("Password updated.", "success");
        } catch (error) {
          throw new Error(getPasswordChangeErrorMessage(error));
        }
      });
    };

    changePasswordBtn.onclick = submitPasswordChange;

    [currentPasswordInput, newPasswordInput, confirmNewPasswordInput].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void submitPasswordChange();
      });
    });

    syncDeletionLinks();
  }

  function setupDeletionControls() {
    if (deleteSelectedDataBtn) {
      deleteSelectedDataBtn.onclick = async () => {
        const selectedBuckets = getSelectedDeletionBuckets();

        if (!selectedBuckets.length) {
          setStatus("Choose at least one data group before deleting anything.", "error");
          return;
        }

        const bucketSummary = selectedBuckets.map((bucket) => deletionBucketLabels[bucket] || bucket).join(", ");
        if (!window.confirm(`Delete ${bucketSummary} now? This cannot be undone.`)) {
          return;
        }

        await withBusy(deleteSelectedDataBtn, "Deleting...", async () => {
          const deleteSelectedDataCallable = httpsCallable(functions, "deleteSelectedData");
          await deleteSelectedDataCallable({
            idToken: await getFreshIdToken(),
            buckets: selectedBuckets
          });
          clearDeletionSelections();
          setStatus("Selected data deleted.", "success");
        });
      };
    }

    if (deleteAccountBtn) {
      deleteAccountBtn.onclick = async () => {
        const feedback = {
          reason: deleteAccountReasonInput?.value.trim() || "",
          improvement: deleteAccountImprovementInput?.value.trim() || ""
        };
        const currentEmail = getCurrentUserEmail();
        const accountMessage = canCurrentUserManageWorkspace()
          ? "This permanently deletes the account, workspace data, and sign-in. Paid owners also lose the active subscription immediately."
          : "This permanently deletes your sign-in and removes your shared access from the purchasing user's workspace.";

        if (!window.confirm(`${accountMessage}\n\nDelete ${currentEmail || "this account"} now?`)) {
          return;
        }

        await withBusy(deleteAccountBtn, "Deleting...", async () => {
          const deleteOwnAccountCallable = httpsCallable(functions, "deleteOwnAccount");
          await deleteOwnAccountCallable({
            idToken: await getFreshIdToken(),
            feedback
          });
          await signOut(auth).catch(() => {});
          window.location.href = "delete-account.html?deleted=1";
        });
      };
    }

    syncDeletionLinks();
    syncDeleteOptionAvailability();
  }

  function syncDeletionLinks() {
    const currentEmail = getCurrentUserEmail();
    const deleteAccountHref = currentEmail
      ? `delete-account.html?email=${encodeURIComponent(currentEmail)}`
      : "delete-account.html";
    const deleteDataHref = currentEmail
      ? `delete-data.html?email=${encodeURIComponent(currentEmail)}`
      : "delete-data.html";

    if (deleteAccountPageLink) {
      deleteAccountPageLink.href = deleteAccountHref;
    }

    if (deleteDataPageLink) {
      deleteDataPageLink.href = deleteDataHref;
    }
  }

  function syncDeleteOptionAvailability() {
    const isWorkspaceOwner = canCurrentUserManageWorkspace();

    deleteDataOptionsGrid?.querySelectorAll("[data-owner-only-delete-option]").forEach((row) => {
      row.hidden = !isWorkspaceOwner;
      const input = row.querySelector("[data-delete-bucket]");
      if (input && !isWorkspaceOwner) {
        input.checked = false;
      }
    });

    if (deleteDataRoleHint) {
      deleteDataRoleHint.textContent = isWorkspaceOwner
        ? "Delete only what you mean to. Timeline data, files, trash, and sharing changes apply to the whole workspace you purchased."
        : "Shared members can clear their own layout preferences here. The purchasing user's workspace data, files, trash, and sharing settings stay in their hands.";
    }
  }

  function getSelectedDeletionBuckets() {
    return [...(deleteDataOptionsGrid?.querySelectorAll("[data-delete-bucket]") || [])]
      .filter((input) => {
        const bucket = String(input.dataset.deleteBucket || "").trim();
        const row = deleteDataOptionsGrid?.querySelector(`[data-delete-option="${bucket}"]`);
        return input.checked && (!row || !row.hidden);
      })
      .map((input) => String(input.dataset.deleteBucket || "").trim())
      .filter(Boolean);
  }

  function clearDeletionSelections() {
    deleteDataOptionsGrid?.querySelectorAll("[data-delete-bucket]").forEach((input) => {
      input.checked = false;
    });
  }

  function getPasswordChangeErrorMessage(error) {
    switch (error?.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
        return "That current password does not look right yet.";
      case "auth/weak-password":
        return "Your new password needs to be stronger. Use at least 6 characters.";
      case "auth/requires-recent-login":
        return "For security, please log out, sign back in, and try changing your password again.";
      case "auth/too-many-requests":
        return "Too many password attempts hit at once. Wait a minute and try again.";
      default:
        return error?.message || "Your password could not be updated yet. Please try again.";
    }
  }

  function setAuthMode(mode) {
    authMode = mode === "signup" ? "signup" : "login";
    const isSignup = authMode === "signup";

    loginModeBtn.classList.toggle("active", !isSignup);
    signupModeBtn.classList.toggle("active", isSignup);
    loginModeBtn.setAttribute("aria-pressed", String(!isSignup));
    signupModeBtn.setAttribute("aria-pressed", String(isSignup));
    loginBtn.hidden = isSignup;
    signupBtn.hidden = !isSignup;
    resetPasswordBtn.hidden = isSignup;
    confirmPassword.hidden = !isSignup;
    password.placeholder = isSignup ? "Create Password" : "Password";
    password.autocomplete = isSignup ? "new-password" : "current-password";
    authModeCopy.textContent = getDefaultAuthModeCopy(isSignup);

    if (!isSignup) {
      confirmPassword.value = "";
    }

    applyInviteAuthState();
    setStatus("");
  }

  function getDefaultAuthModeCopy(isSignup) {
    if (inviteParams.email) {
      if (isSignup) {
        return `Create your account with ${inviteParams.email} to unlock shared access automatically.`;
      }

      return `Use the invited email ${inviteParams.email}. If you have not created your account yet, switch to Sign Up.`;
    }

    return isSignup
      ? "Retype your password before creating the account."
      : "Log in to continue your timeline.";
  }

  function applyInviteAuthState() {
    const hasInviteEmail = Boolean(inviteParams.email);

    email.readOnly = hasInviteEmail;
    email.value = hasInviteEmail ? inviteParams.email : email.value;
    email.classList.toggle("lockedField", hasInviteEmail);

    if (!hasInviteEmail) {
      return;
    }

    authModeCopy.textContent = getDefaultAuthModeCopy(authMode === "signup");

    if (authMode === "signup") {
      password.focus();
      return;
    }

    email.blur();
  }

  function getInviteParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      email: normalizeEmail(params.get("email") || ""),
      mode: params.get("mode") || "",
      invite: params.get("invite") === "1"
    };
  }

  function setupDashboardCustomization() {
    resetDashboardLayoutBtn.onclick = async () => {
      dashboardPreferences = { ...defaultDashboardPreferences };
      applyDashboardPreferences();
      try {
        await saveDashboardPreferences();
        setStatus("Dashboard layout reset to default.", "success");
      } catch (error) {
        console.error(error);
        setStatus("Dashboard preferences could not be saved yet. Please try again.", "error");
      }
    };

    const toggleMap = getDashboardToggleMap();
    Object.entries(toggleMap).forEach(([key, input]) => {
      input.addEventListener("change", async () => {
        dashboardPreferences = {
          ...dashboardPreferences,
          [key]: input.checked
        };
        applyDashboardPreferences();
        try {
          await saveDashboardPreferences();
        } catch (error) {
          console.error(error);
          setStatus("Dashboard preferences could not be saved yet. Please try again.", "error");
        }
      });
    });

    applyDashboardPreferences();
  }

  function getDashboardToggleMap() {
    return {
      showMetrics: toggleMetrics,
      showPlanCards: togglePlanCards,
      showInsights: toggleInsights,
      showPrompts: togglePrompts,
      showUpcoming: toggleUpcoming,
      showRecent: toggleRecent,
      showFolders: toggleFolders
    };
  }

  function normalizeDashboardPreferences(data = {}) {
    return {
      showMetrics: typeof data.showMetrics === "boolean" ? data.showMetrics : defaultDashboardPreferences.showMetrics,
      showPlanCards: typeof data.showPlanCards === "boolean" ? data.showPlanCards : defaultDashboardPreferences.showPlanCards,
      showInsights: typeof data.showInsights === "boolean" ? data.showInsights : defaultDashboardPreferences.showInsights,
      showPrompts: typeof data.showPrompts === "boolean" ? data.showPrompts : defaultDashboardPreferences.showPrompts,
      showUpcoming: typeof data.showUpcoming === "boolean" ? data.showUpcoming : defaultDashboardPreferences.showUpcoming,
      showRecent: typeof data.showRecent === "boolean" ? data.showRecent : defaultDashboardPreferences.showRecent,
      showFolders: typeof data.showFolders === "boolean" ? data.showFolders : defaultDashboardPreferences.showFolders
    };
  }

  function syncDashboardToggleInputs() {
    const toggleMap = getDashboardToggleMap();
    Object.entries(toggleMap).forEach(([key, input]) => {
      input.checked = Boolean(dashboardPreferences[key]);
    });
  }

  function updateDashboardLayoutCount() {
    if (!dashboardLayoutCount) return;
    const toggleMap = getDashboardToggleMap();
    const totalCount = Object.keys(toggleMap).length;
    const visibleCount = Object.keys(toggleMap)
      .filter((key) => Boolean(dashboardPreferences[key]))
      .length;
    dashboardLayoutCount.textContent = `${visibleCount} of ${totalCount} visible`;
  }

  function normalizePlanKey(planKey) {
    if (planKey === "business") {
      return "advanced";
    }

    return planLimits[planKey] ? planKey : "free";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function uniqueEmails(values = []) {
    return [...new Set(values.map(normalizeEmail).filter(Boolean))];
  }

  function normalizeAuthorizedUserPermissions(permissions = {}) {
    return {
      canEdit: !(permissions?.canEdit === false)
    };
  }

  function normalizeAuthorizedUserVisibility(visibility = {}) {
    const folderMode = String(visibility?.folderMode || "").toLowerCase() === "custom"
      ? "custom"
      : "all";
    const visibleFolders = sortFolderValues(
      (Array.isArray(visibility?.visibleFolders) ? visibility.visibleFolders : [])
        .map(sanitizeFolderValue)
        .filter(Boolean)
    );

    return {
      folderMode,
      visibleFolders: folderMode === "custom" ? visibleFolders : []
    };
  }

  function normalizeAuthorizedUsers(usersList = []) {
    if (!Array.isArray(usersList)) return [];

    const seen = new Set();
    return usersList
      .map((entry) => {
        const emailValue = normalizeEmail(entry?.email || entry);
        if (!emailValue || seen.has(emailValue)) return null;
        seen.add(emailValue);

        return {
          email: emailValue,
          uid: String(entry?.uid || ""),
          addedAt: Number(entry?.addedAt) || 0,
          acceptedAt: Number(entry?.acceptedAt) || 0,
          permissions: normalizeAuthorizedUserPermissions(entry?.permissions),
          visibility: normalizeAuthorizedUserVisibility(entry?.visibility)
        };
      })
      .filter(Boolean);
  }

  function getCurrentUserEmail() {
    return normalizeEmail(user?.email);
  }

  function getEffectiveWorkspaceData() {
    return workspaceProfile || userProfile || { plan: "free" };
  }

  function getWorkspaceOwnerUid() {
    return workspaceOwnerUid || userProfile.workspaceOwnerUid || user?.uid || "";
  }

  function getWorkspaceOwnerEmail() {
    const workspaceEmail = normalizeEmail(getEffectiveWorkspaceData().email);
    if (workspaceEmail) return workspaceEmail;
    return getWorkspaceOwnerUid() === user?.uid ? getCurrentUserEmail() : "";
  }

  function getWorkspaceAuthorizedUsers() {
    return normalizeAuthorizedUsers(getEffectiveWorkspaceData().authorizedUsers);
  }

  function getWorkspaceAuthorizedEmails() {
    return getWorkspaceAuthorizedUsers().map((entry) => entry.email);
  }

  function getWorkspaceAuthorizedUser(emailValue = getCurrentUserEmail()) {
    return getWorkspaceAuthorizedUsers().find((entry) => entry.email === normalizeEmail(emailValue)) || null;
  }

  function canAuthorizedUserSeeFolder(entry, folderValue) {
    const visibility = normalizeAuthorizedUserVisibility(entry?.visibility);
    const normalizedFolder = sanitizeFolderValue(folderValue || "general");
    return visibility.folderMode !== "custom" ||
      visibility.visibleFolders.includes(normalizedFolder);
  }

  function getWorkspaceViewerEmails(folderValue = "") {
    const ownerEmail = getWorkspaceOwnerEmail();
    if (!ownerEmail) return [];

    const authorizedViewerEmails = getWorkspaceAuthorizedUsers()
      .filter((entry) => !folderValue || canAuthorizedUserSeeFolder(entry, folderValue))
      .map((entry) => entry.email);

    return getWorkspaceShareLimit()
      ? uniqueEmails([ownerEmail, ...authorizedViewerEmails])
      : [ownerEmail];
  }

  function canCurrentUserManageWorkspace() {
    return Boolean(user && getWorkspaceOwnerUid() === user.uid);
  }

  function canCurrentUserEditWorkspace() {
    if (!user) return false;
    if (canCurrentUserManageWorkspace()) return true;
    return Boolean(
      getWorkspaceAuthorizedUser()?.permissions?.canEdit &&
      getCurrentUserVisibleFolderValues().length
    );
  }

  function canCurrentUserSeeFolder(folderValue) {
    if (canCurrentUserManageWorkspace()) return true;
    const currentEntry = getWorkspaceAuthorizedUser();
    if (!currentEntry) return true;
    return canAuthorizedUserSeeFolder(currentEntry, folderValue);
  }

  function canCurrentUserManageVisibility() {
    return canCurrentUserManageWorkspace() &&
      getWorkspaceShareLimit() > 0 &&
      getWorkspaceAuthorizedUsers().length > 0;
  }

  function ensureWorkspaceEditAccess(actionLabel = "change this shared workspace") {
    if (canCurrentUserEditWorkspace()) return true;
    setStatus(`Only the purchasing user or an invited editor can ${actionLabel}.`, "error");
    return false;
  }

  function getAuthorizedUserPermissionCopy(entry) {
    return entry?.permissions?.canEdit
      ? "Can edit the shared workspace anywhere you make items visible."
      : "View only. They can only see the items you include, and they cannot edit or upload.";
  }

  function getAuthorizedUserVisibilityCopy(entry) {
    const visibility = normalizeAuthorizedUserVisibility(entry?.visibility);
    if (visibility.folderMode !== "custom") {
      return "Can see every folder you leave visible at the event level.";
    }

    if (!visibility.visibleFolders.length) {
      return "No folders are visible yet. They will not see anything until you pick folders.";
    }

    if (visibility.visibleFolders.length <= 3) {
      return `Only sees ${visibility.visibleFolders.map(formatFolderLabel).join(", ")}.`;
    }

    return `Only sees ${visibility.visibleFolders.length} selected folders.`;
  }

  function getAuthorizedUserFolderAccessSummary(entry) {
    const visibility = normalizeAuthorizedUserVisibility(entry?.visibility);
    if (visibility.folderMode !== "custom") {
      return "All folders currently visible";
    }

    if (!visibility.visibleFolders.length) {
      return "No folders selected yet";
    }

    if (visibility.visibleFolders.length === 1) {
      return `1 folder selected`;
    }

    return `${visibility.visibleFolders.length} folders selected`;
  }

  function getAuthorizedUserFolderAccessBadge(entry) {
    const visibility = normalizeAuthorizedUserVisibility(entry?.visibility);
    if (visibility.folderMode !== "custom") {
      return "All folders";
    }

    if (!visibility.visibleFolders.length) {
      return "No folders";
    }

    if (visibility.visibleFolders.length === 1) {
      return "1 folder";
    }

    return `${visibility.visibleFolders.length} folders`;
  }

  function applyWorkspaceAccessState() {
    const canEditWorkspace = canCurrentUserEditWorkspace();
    const composerControls = [
      title,
      summary,
      notes,
      startDate,
      endDate,
      reminderDate,
      folderSelect,
      statusSelectInput,
      locationInput,
      amountInput,
      peopleInput,
      tagsInput,
      externalLinkInput,
      addCustomFieldBtn,
      newFolderInput,
      addFolderBtn,
      selectFilesBtn,
    ];

    composerControls.forEach((control) => {
      if (!control) return;
      control.disabled = !canEditWorkspace;
    });

    if (addBtn) {
      addBtn.disabled = !canEditWorkspace;
      addBtn.textContent = canEditWorkspace ?
        (editingId ? "Save Changes" : "Add Event") :
        "View Only";
    }
  }

  function getWorkspaceShareLimit() {
    return Number(getCurrentPlan()?.shareLimit || 0);
  }

  function doesWorkspaceAuthorizeCurrentUser(workspaceData = {}) {
    if (!user) return false;
    if ((workspaceData.uid || "") === user.uid) return true;
    return normalizePlanKey(workspaceData.plan) !== "free" &&
      normalizeEmailList(workspaceData.authorizedUserEmails).includes(getCurrentUserEmail());
  }

  function normalizeEmailList(values = []) {
    return uniqueEmails(Array.isArray(values) ? values : []);
  }

  function listsMatch(left = [], right = []) {
    const normalizedLeft = uniqueEmails(left).sort();
    const normalizedRight = uniqueEmails(right).sort();
    if (normalizedLeft.length !== normalizedRight.length) return false;
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }

  function normalizeVisibilityMode(mode, visibleEmails = []) {
    return String(mode || "").toLowerCase() === "custom" && visibleEmails.length ? "custom" : "workspace";
  }

  function resolveWorkspaceVisibilitySettings(eventItem = {}) {
    const targetFolder = sanitizeFolderValue(eventItem.folder || folderSelect?.value || defaultFolders[0].value);
    const workspaceViewerEmails = getWorkspaceViewerEmails();
    const folderViewerEmails = getWorkspaceViewerEmails(targetFolder);
    const fallbackVisibleEmails = folderViewerEmails.length
      ? folderViewerEmails
      : [getWorkspaceOwnerEmail() || getCurrentUserEmail()].filter(Boolean);
    const storedVisibleEmails = normalizeEmailList(eventItem.visibleToEmails);
    const storedCustomVisibleEmails = normalizeEmailList(
      Array.isArray(eventItem.customVisibleToEmails) ? eventItem.customVisibleToEmails : storedVisibleEmails
    );
    const visibilityMode = normalizeVisibilityMode(eventItem.visibilityMode, storedCustomVisibleEmails);

    if (visibilityMode === "custom" && storedCustomVisibleEmails.length) {
      const customVisibleEmails = uniqueEmails([
        getWorkspaceOwnerEmail(),
        ...storedCustomVisibleEmails.filter((email) => workspaceViewerEmails.includes(email))
      ]);
      const nextVisibleEmails = uniqueEmails([
        getWorkspaceOwnerEmail(),
        ...customVisibleEmails.filter((email) => fallbackVisibleEmails.includes(email))
      ]);

      return {
        visibilityMode: "custom",
        visibleToEmails: nextVisibleEmails.length ? nextVisibleEmails : fallbackVisibleEmails,
        customVisibleToEmails: customVisibleEmails
      };
    }

    return {
      visibilityMode: "workspace",
      visibleToEmails: fallbackVisibleEmails,
      customVisibleToEmails: []
    };
  }

  function getAuthorizedUserFolderChoices(entry = null) {
    const currentFolders = getAllFolderValues();
    const savedFolders = entry?.visibility?.visibleFolders || [];
    return sortFolderValues([...currentFolders, ...savedFolders]);
  }

  function getCurrentUserVisibleFolderValues() {
    const allFolders = getAllFolderValues();
    if (canCurrentUserManageWorkspace()) {
      return allFolders;
    }

    const currentEntry = getWorkspaceAuthorizedUser();
    if (!currentEntry) {
      return allFolders;
    }

    const visibility = normalizeAuthorizedUserVisibility(currentEntry.visibility);
    if (visibility.folderMode !== "custom") {
      return allFolders;
    }

    return allFolders.filter((folder) => visibility.visibleFolders.includes(folder));
  }

  function applyDashboardPreferences() {
    metricsGrid.hidden = !dashboardPreferences.showMetrics;
    upgradePanel.hidden = !dashboardPreferences.showPlanCards;
    insightsPanel.hidden = !dashboardPreferences.showInsights;
    promptsPanel.hidden = !dashboardPreferences.showPrompts;
    upcomingPanel.hidden = !dashboardPreferences.showUpcoming;
    recentPanel.hidden = !dashboardPreferences.showRecent;
    folderPulsePanel.hidden = !dashboardPreferences.showFolders;
    syncDashboardToggleInputs();
    updateDashboardLayoutCount();
  }

  function setupComposerCustomization() {
    resetComposerLayoutBtn.onclick = async () => {
      composerPreferences = { ...defaultComposerPreferences };
      applyComposerPreferences();
      try {
        await saveComposerPreferences();
        setStatus("Composer layout reset to default.", "success");
      } catch (error) {
        console.error(error);
        setStatus("Composer preferences could not be saved yet. Please try again.", "error");
      }
    };

    const toggleMap = getComposerToggleMap();
    Object.entries(toggleMap).forEach(([key, input]) => {
      input.addEventListener("change", async () => {
        composerPreferences = {
          ...composerPreferences,
          [key]: input.checked
        };
        applyComposerPreferences();
        try {
          await saveComposerPreferences();
        } catch (error) {
          console.error(error);
          setStatus("Composer preferences could not be saved yet. Please try again.", "error");
        }
      });
    });

    const labelMap = getComposerLabelInputMap();
    Object.entries(labelMap).forEach(([key, input]) => {
      input.addEventListener("change", async () => {
        composerPreferences = {
          ...composerPreferences,
          [key]: sanitizeComposerLabel(input.value, defaultComposerPreferences[key])
        };
        applyComposerPreferences();
        try {
          await saveComposerPreferences();
          setStatus("Composer labels saved.", "success");
        } catch (error) {
          console.error(error);
          setStatus("Composer labels could not be saved yet. Please try again.", "error");
        }
      });
    });

    applyComposerPreferences();
  }

  function setupCustomFieldEditor() {
    addCustomFieldBtn.onclick = () => {
      selectedCustomFields = [
        ...selectedCustomFields,
        { id: generateCustomFieldId(), label: "", value: "" }
      ];
      renderCustomFieldEditor();
    };

    renderCustomFieldEditor();
  }

  function setupSharingControls() {
    if (addAuthorizedUserBtn) {
      addAuthorizedUserBtn.onclick = async () => {
        const emailValue = normalizeEmail(authorizedUserEmailInput?.value);

        if (!emailValue) {
          setStatus("Enter an email address first.", "error");
          return;
        }

        const nextAuthorizedUsers = [
          ...getWorkspaceAuthorizedUsers(),
          {
            email: emailValue,
            permissions: { canEdit: true },
            visibility: { folderMode: "all", visibleFolders: [] }
          }
        ];
        const saved = await saveAuthorizedUsers(nextAuthorizedUsers, addAuthorizedUserBtn);

        if (saved && authorizedUserEmailInput) {
          authorizedUserEmailInput.value = "";
        }
      };
    }

    authorizedUserEmailInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addAuthorizedUserBtn?.click();
    });

    folderSelect?.addEventListener("change", () => {
      const activeEvent = editingId ? events.find((event) => event.id === editingId) : null;
      const nextVisibility = resolveWorkspaceVisibilitySettings({
        ...(activeEvent || {}),
        folder: folderSelect.value || "general",
        visibilityMode: activeEvent?.visibilityMode || (selectedVisibleToEmails.length ? "custom" : "workspace"),
        customVisibleToEmails: activeEvent?.customVisibleToEmails || selectedVisibleToEmails,
        visibleToEmails: activeEvent?.visibleToEmails || selectedVisibleToEmails
      });
      selectedVisibleToEmails = nextVisibility.customVisibleToEmails.length
        ? [...nextVisibility.customVisibleToEmails]
        : [...nextVisibility.visibleToEmails];
      renderVisibilityControls(activeEvent ? { ...activeEvent, folder: folderSelect.value || "general" } : { folder: folderSelect.value || "general" });
    });
  }

  async function saveAuthorizedUsers(nextUsers, button = addAuthorizedUserBtn) {
    if (!canCurrentUserManageWorkspace()) {
      setStatus("Only the account owner can manage authorized users.", "error");
      return false;
    }

    const normalizedUsers = normalizeAuthorizedUsers(nextUsers).filter((entry) => entry.email !== getWorkspaceOwnerEmail());
    const shareLimit = getWorkspaceShareLimit();

    if (!shareLimit) {
      showUpgradePrompt("sharing");
      return false;
    }

    if (normalizedUsers.length > shareLimit) {
      setStatus(`This plan can share with ${shareLimit} authorized user${shareLimit === 1 ? "" : "s"}.`, "error");
      return false;
    }

    return withBusy(button, "Saving...", async () => {
      const saveAuthorizedUsersCallable = httpsCallable(functions, "saveAuthorizedUsers");
      const result = await saveAuthorizedUsersCallable({
        idToken: await getFreshIdToken(),
        authorizedUsers: normalizedUsers.map((entry) => ({
          email: entry.email,
          permissions: {
            canEdit: Boolean(entry.permissions?.canEdit)
          },
          visibility: {
            folderMode: entry.visibility?.folderMode === "custom" ? "custom" : "all",
            visibleFolders: Array.isArray(entry.visibility?.visibleFolders)
              ? entry.visibility.visibleFolders.map(sanitizeFolderValue).filter(Boolean)
              : []
          }
        }))
      });

      const count = Number(result.data?.count || normalizedUsers.length);
      const newInviteCount = Number(result.data?.newInviteCount || 0);
      const inviteCount = Number(result.data?.inviteCount || 0);
      const inviteConfigured = result.data?.inviteConfigured !== false;
      const inviteFailures = Array.isArray(result.data?.inviteFailures) ? result.data.inviteFailures : [];
      let successMessage = count
        ? `Authorized users updated. ${count} shared slot${count === 1 ? "" : "s"} active.`
        : "Authorized users cleared.";

      if (newInviteCount) {
        if (!inviteConfigured) {
          successMessage += " Invite email is ready, but mail sending still needs to be connected first.";
        } else if (inviteCount === newInviteCount) {
          successMessage += ` Invite email${inviteCount === 1 ? "" : "s"} sent.`;
        } else if (inviteCount) {
          successMessage += ` ${inviteCount} invite email${inviteCount === 1 ? "" : "s"} sent.`;
        }
      }

      setStatus(
        successMessage,
        "success"
      );

      if (inviteFailures.length) {
        const failedEmails = inviteFailures.map((entry) => entry.email).filter(Boolean);
        setStatus(
          `Authorized users saved, but invite email${failedEmails.length === 1 ? "" : "s"} could not be sent to ${failedEmails.join(", ")}.`,
          "error"
        );
      }

      editingAuthorizedUserEmail = "";
    });
  }

  function renderAuthorizedUsersPanel() {
    if (!authorizedUsersPanel || !authorizedUsersSummary || !authorizedUsersEditor || !authorizedUsersList) return;

    const shareLimit = getWorkspaceShareLimit();
    const authorizedUsers = getWorkspaceAuthorizedUsers();
    const currentPlan = getCurrentPlan();
    const ownerEmail = getWorkspaceOwnerEmail();
    if (editingAuthorizedUserEmail && !authorizedUsers.some((entry) => entry.email === editingAuthorizedUserEmail)) {
      editingAuthorizedUserEmail = "";
    }

    authorizedUsersPanel.hidden = false;

    if (!canCurrentUserManageWorkspace()) {
      authorizedUsersSummary.innerHTML = `
        <strong>Shared access is active.</strong>
        <span>This account is connected through ${escapeHtml(ownerEmail || "the purchasing user")}. Hidden events stay invisible unless the owner includes you, and only invited editors can change shared items.</span>
      `;
      authorizedUsersEditor.hidden = true;
      authorizedUsersList.innerHTML = "";
      return;
    }

    if (!shareLimit) {
      authorizedUsersSummary.innerHTML = `
        <strong>Sharing unlocks on paid plans.</strong>
        <span>Home can add 1 authorized user. Advanced can add up to 3. Shared users inherit the paid workspace, while you keep control over event visibility.</span>
      `;
      authorizedUsersEditor.hidden = true;
      authorizedUsersList.innerHTML = "";
      return;
    }

    authorizedUsersEditor.hidden = false;
    if (authorizedUserEmailInput) {
      authorizedUserEmailInput.disabled = authorizedUsers.length >= shareLimit;
      authorizedUserEmailInput.placeholder = authorizedUsers.length >= shareLimit
        ? `All ${shareLimit} shared slot${shareLimit === 1 ? "" : "s"} are in use`
        : "Add an email like spouse@example.com";
    }
    if (addAuthorizedUserBtn) {
      addAuthorizedUserBtn.disabled = authorizedUsers.length >= shareLimit;
    }

    authorizedUsersSummary.innerHTML = `
      <strong>${escapeHtml(currentPlan.label)} includes ${shareLimit} authorized user${shareLimit === 1 ? "" : "s"}.</strong>
      <span>${authorizedUsers.length} of ${shareLimit} shared slot${shareLimit === 1 ? "" : "s"} in use. Great for families sharing vehicles, insurance cards, paperwork, and reminders in one place while you quietly hide anything private. Use Edit to decide what they can do and which folders they are even allowed to see.</span>
    `;

    authorizedUsersList.innerHTML = authorizedUsers.length
      ? authorizedUsers
          .map((entry) => {
            const isEditing = editingAuthorizedUserEmail === entry.email;
            return `
            <article class="sharingUserCard ${isEditing ? "editing" : ""}">
              <div>
                <strong>${escapeHtml(entry.email)}</strong>
                <p>${entry.uid ? "Connected and ready to use the shared plan." : "Invite saved. Access starts when this email signs in."}</p>
                <small class="sharingPermissionSummary">${escapeHtml(getAuthorizedUserPermissionCopy(entry))}</small>
                <small class="sharingPermissionSummary">${escapeHtml(getAuthorizedUserVisibilityCopy(entry))}</small>
              </div>
              <div class="sharingUserActions">
                <span class="sharingBadge ${entry.uid ? "connected" : "pending"}">${entry.uid ? "Connected" : "Pending"}</span>
                <button type="button" class="secondaryBtn editAuthorizedUserBtn" data-edit-authorized="${escapeHtml(entry.email)}">${isEditing ? "Close" : "Edit"}</button>
                <button type="button" class="secondaryBtn removeAuthorizedUserBtn" data-remove-authorized="${escapeHtml(entry.email)}">Remove</button>
              </div>
              ${isEditing ? `
                <div class="sharingPermissionEditor">
                  <label class="toggleRow" for="editAuthorized_${escapeHtml(entry.email)}">
                    <span>
                      <strong>Can edit shared items</strong>
                      <small>When turned off, this person becomes view-only. Event visibility still stays in your hands from each event.</small>
                    </span>
                    <input id="editAuthorized_${escapeHtml(entry.email)}" type="checkbox" data-authorized-can-edit="${escapeHtml(entry.email)}" ${entry.permissions?.canEdit ? "checked" : ""}>
                  </label>
                  <details class="sharingVisibilityEditor">
                    <summary>
                      <div>
                        <strong>Folder access</strong>
                        <small>${escapeHtml(getAuthorizedUserFolderAccessSummary(entry))}</small>
                      </div>
                      <span class="settingsSelectionCount">${escapeHtml(getAuthorizedUserFolderAccessBadge(entry))}</span>
                    </summary>
                    <div class="sharingVisibilityEditorBody">
                      <label class="toggleRow" for="showAllFolders_${escapeHtml(entry.email)}">
                        <span>
                          <strong>Can see every folder</strong>
                          <small>Turn this off when someone should only see specific folders like Vehicles or Medical.</small>
                        </span>
                        <input
                          id="showAllFolders_${escapeHtml(entry.email)}"
                          type="checkbox"
                          data-authorized-folder-mode="${escapeHtml(entry.email)}"
                          ${entry.visibility?.folderMode !== "custom" ? "checked" : ""}
                        >
                      </label>
                      <div class="sharingFolderChecklist ${entry.visibility?.folderMode === "custom" ? "isVisible" : ""}" data-authorized-folder-list="${escapeHtml(entry.email)}">
                        ${getAuthorizedUserFolderChoices(entry).map((folderValue) => `
                          <label class="sharingFolderOption" for="folderAccess_${escapeHtml(entry.email)}_${escapeHtml(folderValue)}">
                            <input
                              id="folderAccess_${escapeHtml(entry.email)}_${escapeHtml(folderValue)}"
                              type="checkbox"
                              data-authorized-folder="${escapeHtml(folderValue)}"
                              ${entry.visibility?.visibleFolders?.includes(folderValue) ? "checked" : ""}
                            >
                            <span>${escapeHtml(formatFolderLabel(folderValue))}</span>
                          </label>
                        `).join("")}
                      </div>
                      <p class="sharingVisibilityHint">Folder visibility is the broad privacy gate. Event visibility inside those folders still stays in your hands, and subfolders follow the event they live under.</p>
                    </div>
                  </details>
                  <div class="sharingPermissionActions">
                    <button type="button" class="secondaryBtn saveAuthorizedPermissionsBtn" data-save-authorized="${escapeHtml(entry.email)}">Save Access</button>
                    <button type="button" class="secondaryBtn cancelAuthorizedPermissionsBtn" data-cancel-authorized="${escapeHtml(entry.email)}">Cancel</button>
                  </div>
                </div>
              ` : ""}
            </article>
          `;
          })
          .join("")
      : '<div class="emptyState">No authorized users yet. Add someone who needs access to the shared account.</div>';

    authorizedUsersList.querySelectorAll("[data-edit-authorized]").forEach((button) => {
      button.onclick = () => {
        const emailValue = normalizeEmail(button.dataset.editAuthorized);
        editingAuthorizedUserEmail = editingAuthorizedUserEmail === emailValue ? "" : emailValue;
        renderAuthorizedUsersPanel();
      };
    });

    authorizedUsersList.querySelectorAll("[data-cancel-authorized]").forEach((button) => {
      button.onclick = () => {
        editingAuthorizedUserEmail = "";
        renderAuthorizedUsersPanel();
      };
    });

    authorizedUsersList.querySelectorAll("[data-save-authorized]").forEach((button) => {
      button.onclick = async () => {
        const emailValue = normalizeEmail(button.dataset.saveAuthorized);
        const card = button.closest(".sharingUserCard");
        const canEditInput = card?.querySelector("[data-authorized-can-edit]");
        const folderModeInput = card?.querySelector("[data-authorized-folder-mode]");
        const folderInputs = Array.from(card?.querySelectorAll("[data-authorized-folder]") || []);
        const folderMode = folderModeInput?.checked ? "all" : "custom";
        const visibleFolders = folderInputs
          .filter((input) => input.checked)
          .map((input) => sanitizeFolderValue(input.dataset.authorizedFolder));
        const nextAuthorizedUsers = authorizedUsers.map((entry) =>
          entry.email === emailValue
            ? {
                ...entry,
                permissions: {
                  canEdit: Boolean(canEditInput?.checked)
                },
                visibility: {
                  folderMode,
                  visibleFolders
                }
              }
            : entry
        );
        const saved = await saveAuthorizedUsers(nextAuthorizedUsers, button);
        if (saved) {
          editingAuthorizedUserEmail = "";
        }
      };
    });

    authorizedUsersList.querySelectorAll("[data-authorized-folder-mode]").forEach((input) => {
      input.addEventListener("change", () => {
        const emailValue = normalizeEmail(input.dataset.authorizedFolderMode);
        const card = input.closest(".sharingUserCard");
        const folderList = card?.querySelector(`[data-authorized-folder-list="${emailValue}"]`);
        if (!folderList) return;
        folderList.classList.toggle("isVisible", !input.checked);
      });
    });

    authorizedUsersList.querySelectorAll("[data-remove-authorized]").forEach((button) => {
      button.onclick = async () => {
        const emailValue = normalizeEmail(button.dataset.removeAuthorized);
        const nextAuthorizedUsers = authorizedUsers.filter((entry) => entry.email !== emailValue);
        editingAuthorizedUserEmail = editingAuthorizedUserEmail === emailValue ? "" : editingAuthorizedUserEmail;
        await saveAuthorizedUsers(nextAuthorizedUsers, button);
      };
    });
  }

  function renderVisibilityControls(eventItem = null) {
    if (!visibilitySection || !visibilitySummary || !visibilityChecklist) return;

    if (!canCurrentUserManageVisibility()) {
      visibilitySection.hidden = true;
      visibilitySummary.innerHTML = "";
      visibilityChecklist.innerHTML = "";
      return;
    }

    const workspaceMembers = [
      {
        email: getWorkspaceOwnerEmail(),
        label: getWorkspaceOwnerEmail() === getCurrentUserEmail() ? "You (owner)" : "Owner",
        locked: true,
        connected: true
      },
      ...getWorkspaceAuthorizedUsers().map((entry) => ({
        email: entry.email,
        label: entry.email,
        locked: false,
        connected: Boolean(entry.uid)
      }))
    ].filter((entry) => entry.email);

    if (workspaceMembers.length <= 1) {
      visibilitySection.hidden = true;
      return;
    }

    const targetFolder = sanitizeFolderValue(eventItem?.folder || folderSelect?.value || defaultFolders[0].value);
    const defaultVisibleEmails = getWorkspaceViewerEmails(targetFolder);
    const currentVisibility = eventItem
      ? resolveWorkspaceVisibilitySettings(eventItem)
      : resolveWorkspaceVisibilitySettings({
          folder: targetFolder,
          visibilityMode: listsMatch(selectedVisibleToEmails, defaultVisibleEmails) ? "workspace" : "custom",
          customVisibleToEmails: selectedVisibleToEmails,
          visibleToEmails: selectedVisibleToEmails
        });
    selectedVisibleToEmails = uniqueEmails([
      getWorkspaceOwnerEmail(),
      ...(selectedVisibleToEmails.length ? selectedVisibleToEmails : currentVisibility.customVisibleToEmails.length ? currentVisibility.customVisibleToEmails : currentVisibility.visibleToEmails)
        .filter((email) => defaultVisibleEmails.includes(email))
    ]);
    const isWorkspaceWide = listsMatch(selectedVisibleToEmails, defaultVisibleEmails);

    visibilitySection.hidden = false;
    visibilitySummary.innerHTML = isWorkspaceWide
      ? "<strong>Everyone on this shared account can see this event.</strong><span>Use the checkboxes below only when something should stay private or surprise-safe.</span>"
      : "<strong>This event is private to selected people only.</strong><span>Unchecked people will not know it exists on the timeline, in views, in story mode, or in trash.</span>";

    visibilityChecklist.innerHTML = workspaceMembers
      .map((entry) => `
        <label class="toggleRow sharingVisibilityRow" for="visibility_${escapeHtml(entry.email)}">
          <span>
            <strong>${escapeHtml(entry.label)}</strong>
            <small>${
              entry.locked
                ? "The purchasing account always keeps access."
                : !canAuthorizedUserSeeFolder(getWorkspaceAuthorizedUser(entry.email), targetFolder)
                  ? `Hidden from ${formatFolderLabel(targetFolder)} in their access settings.`
                  : entry.connected
                    ? "Connected now."
                    : "Invite saved. This stays ready for them when they sign in."
            }</small>
          </span>
          <input
            id="visibility_${escapeHtml(entry.email)}"
            type="checkbox"
            data-visible-email="${escapeHtml(entry.email)}"
            ${selectedVisibleToEmails.includes(entry.email) ? "checked" : ""}
            ${entry.locked || !canAuthorizedUserSeeFolder(getWorkspaceAuthorizedUser(entry.email), targetFolder) ? "disabled" : ""}
          >
        </label>
      `)
      .join("");

    visibilityChecklist.querySelectorAll("[data-visible-email]").forEach((input) => {
      input.addEventListener("change", () => {
        const targetEmail = normalizeEmail(input.dataset.visibleEmail);
        if (!targetEmail || targetEmail === getWorkspaceOwnerEmail()) return;

        selectedVisibleToEmails = input.checked
          ? uniqueEmails([...selectedVisibleToEmails, targetEmail, getWorkspaceOwnerEmail()])
          : uniqueEmails(selectedVisibleToEmails.filter((email) => email !== targetEmail));

        renderVisibilityControls(eventItem);
      });
    });
  }

  function getComposerToggleMap() {
    return {
      showSummary: toggleComposerSummary,
      showEndDate: toggleComposerEndDate,
      showReminderDate: toggleComposerReminder,
      showLocation: toggleComposerLocation,
      showAmount: toggleComposerAmount,
      showPeople: toggleComposerPeople,
      showTags: toggleComposerTags,
      showExternalLink: toggleComposerLink,
      showNotes: toggleComposerNotes
    };
  }

  function getComposerLabelInputMap() {
    return {
      summaryLabel: summaryLabelInput,
      locationLabel: locationLabelInput,
      amountLabel: amountLabelInput,
      peopleLabel: peopleLabelInput,
      tagsLabel: tagsLabelInput,
      externalLinkLabel: externalLinkLabelInput,
      notesLabel: notesLabelInput
    };
  }

  function normalizeComposerPreferences(data = {}) {
    return {
      showSummary: typeof data.showSummary === "boolean" ? data.showSummary : defaultComposerPreferences.showSummary,
      showEndDate: typeof data.showEndDate === "boolean" ? data.showEndDate : defaultComposerPreferences.showEndDate,
      showReminderDate: typeof data.showReminderDate === "boolean" ? data.showReminderDate : defaultComposerPreferences.showReminderDate,
      showLocation: typeof data.showLocation === "boolean" ? data.showLocation : defaultComposerPreferences.showLocation,
      showAmount: typeof data.showAmount === "boolean" ? data.showAmount : defaultComposerPreferences.showAmount,
      showPeople: typeof data.showPeople === "boolean" ? data.showPeople : defaultComposerPreferences.showPeople,
      showTags: typeof data.showTags === "boolean" ? data.showTags : defaultComposerPreferences.showTags,
      showExternalLink: typeof data.showExternalLink === "boolean" ? data.showExternalLink : defaultComposerPreferences.showExternalLink,
      showNotes: typeof data.showNotes === "boolean" ? data.showNotes : defaultComposerPreferences.showNotes,
      summaryLabel: sanitizeComposerLabel(data.summaryLabel, defaultComposerPreferences.summaryLabel),
      locationLabel: sanitizeComposerLabel(data.locationLabel, defaultComposerPreferences.locationLabel),
      amountLabel: sanitizeComposerLabel(data.amountLabel, defaultComposerPreferences.amountLabel),
      peopleLabel: sanitizeComposerLabel(data.peopleLabel, defaultComposerPreferences.peopleLabel),
      tagsLabel: sanitizeComposerLabel(data.tagsLabel, defaultComposerPreferences.tagsLabel),
      externalLinkLabel: sanitizeComposerLabel(data.externalLinkLabel, defaultComposerPreferences.externalLinkLabel),
      notesLabel: sanitizeComposerLabel(data.notesLabel, defaultComposerPreferences.notesLabel)
    };
  }

  function sanitizeComposerLabel(value, fallback) {
    const trimmed = String(value || "").trim();
    return trimmed.slice(0, 40) || fallback;
  }

  function syncComposerInputs() {
    const toggleMap = getComposerToggleMap();
    Object.entries(toggleMap).forEach(([key, input]) => {
      input.checked = Boolean(composerPreferences[key]);
    });

    const labelMap = getComposerLabelInputMap();
    Object.entries(labelMap).forEach(([key, input]) => {
      input.value = composerPreferences[key] || defaultComposerPreferences[key];
    });
  }

  function updateComposerLayoutCount() {
    if (!composerLayoutCount) return;
    const toggleMap = getComposerToggleMap();
    const totalCount = Object.keys(toggleMap).length;
    const visibleCount = Object.keys(toggleMap)
      .filter((key) => Boolean(composerPreferences[key]))
      .length;
    composerLayoutCount.textContent = `${visibleCount} of ${totalCount} visible`;
  }

  function applyComposerPreferences() {
    summaryGroup.hidden = !composerPreferences.showSummary;
    endDateGroup.hidden = !composerPreferences.showEndDate;
    reminderDateGroup.hidden = !composerPreferences.showReminderDate;
    locationGroup.hidden = !composerPreferences.showLocation;
    amountGroup.hidden = !composerPreferences.showAmount;
    peopleGroup.hidden = !composerPreferences.showPeople;
    tagsGroup.hidden = !composerPreferences.showTags;
    externalLinkGroup.hidden = !composerPreferences.showExternalLink;
    notesGroup.hidden = !composerPreferences.showNotes;

    summaryLabel.textContent = composerPreferences.summaryLabel;
    locationLabel.textContent = composerPreferences.locationLabel;
    amountLabel.textContent = composerPreferences.amountLabel;
    peopleLabel.textContent = composerPreferences.peopleLabel;
    tagsLabel.textContent = composerPreferences.tagsLabel;
    externalLinkLabel.textContent = composerPreferences.externalLinkLabel;
    notesLabel.textContent = composerPreferences.notesLabel;
    syncComposerInputs();
    updateComposerLayoutCount();
  }

  function generateSectionId() {
    return `section_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function generateCustomFieldId() {
    return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeCustomFields(fields) {
    if (!Array.isArray(fields)) return [];

    return fields
      .map((field) => {
        const label = String(field?.label || "").trim();
        const value = String(field?.value || "").trim();
        if (!label && !value) return null;

        return {
          id: String(field.id || generateCustomFieldId()),
          label: label.slice(0, 80) || "Detail",
          value: value.slice(0, 500)
        };
      })
      .filter(Boolean);
  }

  function renderCustomFieldEditor() {
    if (!customFieldsList) return;

    if (!selectedCustomFields.length) {
      customFieldsList.innerHTML = '<div class="emptyState">No custom details yet. Add rows for anything this event needs to track.</div>';
      return;
    }

    customFieldsList.innerHTML = selectedCustomFields
      .map((field) => `
        <div class="customFieldRow" data-custom-field-id="${escapeHtml(field.id)}">
          <input class="customFieldLabelInput" type="text" placeholder="Label like Landlord, Truck ID, Client, or Vendor" value="${escapeHtml(field.label)}">
          <input class="customFieldValueInput" type="text" placeholder="Value" value="${escapeHtml(field.value)}">
          <button class="secondaryBtn removeCustomFieldBtn" type="button">Remove</button>
        </div>
      `)
      .join("");

    customFieldsList.querySelectorAll("[data-custom-field-id]").forEach((row) => {
      const fieldId = row.dataset.customFieldId;
      row.querySelector(".customFieldLabelInput").addEventListener("input", (event) => {
        selectedCustomFields = selectedCustomFields.map((field) =>
          field.id === fieldId ? { ...field, label: event.target.value } : field
        );
      });
      row.querySelector(".customFieldValueInput").addEventListener("input", (event) => {
        selectedCustomFields = selectedCustomFields.map((field) =>
          field.id === fieldId ? { ...field, value: event.target.value } : field
        );
      });
      row.querySelector(".removeCustomFieldBtn").onclick = () => {
        selectedCustomFields = selectedCustomFields.filter((field) => field.id !== fieldId);
        renderCustomFieldEditor();
      };
    });
  }

  function normalizeSections(sections) {
    if (!Array.isArray(sections)) return [];

    return sections
      .map((section) => {
        const titleValue = String(section?.title || "").trim();
        if (!titleValue) return null;

        return {
          id: String(section.id || generateSectionId()),
          title: titleValue.slice(0, 120),
          notes: String(section.notes || "").trim().slice(0, 10000),
          attachments: normalizeAttachments(section.attachments),
          items: normalizeSubEvents(section.items)
        };
      })
      .filter(Boolean);
  }

  function getRemovedSectionAttachments(previousSections = [], nextSections = []) {
    const nextIds = new Set(nextSections.map((section) => section.id));
    return previousSections
      .filter((section) => !nextIds.has(section.id))
      .flatMap((section) => getSectionAttachmentList(section));
  }

  function getSectionAttachmentList(section) {
    return [
      ...(section?.attachments || []),
      ...((section?.items || []).flatMap((item) => item.attachments || []))
    ];
  }

  function normalizeSubEvents(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const titleValue = String(item?.title || "").trim();
        if (!titleValue) return null;

        return {
          id: String(item.id || `subevent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          title: titleValue.slice(0, 160),
          summary: String(item.summary || "").trim().slice(0, 500),
          date: String(item.date || "").trim().slice(0, 30),
          status: ["planned", "active", "done", "archived"].includes(item.status) ? item.status : "planned",
          notes: String(item.notes || "").trim().slice(0, 8000),
          attachments: normalizeAttachments(item.attachments)
        };
      })
      .filter(Boolean);
  }

  function normalizeSectionsForStorage(sections) {
    if (!Array.isArray(sections)) return [];

    return sections
      .map((section) => {
        const titleValue = String(section?.title || "").trim();
        if (!titleValue) return null;

        return {
          id: String(section.id || generateSectionId()),
          title: titleValue.slice(0, 120),
          notes: String(section.notes || "").trim().slice(0, 10000),
          attachments: normalizeAttachmentsForStorage(section.attachments),
          items: normalizeSubEventsForStorage(section.items)
        };
      })
      .filter(Boolean);
  }

  function normalizeSubEventsForStorage(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => {
        const titleValue = String(item?.title || "").trim();
        if (!titleValue) return null;

        return {
          id: String(item.id || `subevent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          title: titleValue.slice(0, 160),
          summary: String(item.summary || "").trim().slice(0, 500),
          date: String(item.date || "").trim().slice(0, 30),
          status: ["planned", "active", "done", "archived"].includes(item.status) ? item.status : "planned",
          notes: String(item.notes || "").trim().slice(0, 8000),
          attachments: normalizeAttachmentsForStorage(item.attachments)
        };
      })
      .filter(Boolean);
  }

  function normalizeEventStatus(value) {
    return ["planned", "active", "done", "archived"].includes(value) ? value : "planned";
  }

  function normalizeAmountValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function buildEventDocumentPayload(eventItem, overrides = {}) {
    const merged = {
      ...eventItem,
      ...overrides
    };
    const visibilitySettings = resolveWorkspaceVisibilitySettings(merged);

    return {
      uid: merged.uid || getWorkspaceOwnerUid() || user?.uid || "",
      createdByUid: merged.createdByUid || user?.uid || "",
      title: String(merged.title || "Untitled Event").slice(0, 200),
      summary: String(merged.summary || "").slice(0, 500),
      notes: String(merged.notes || "").slice(0, 20000),
      startDate: String(merged.startDate || "").slice(0, 30),
      endDate: String(merged.endDate || "").slice(0, 30),
      reminderDate: String(merged.reminderDate || "").slice(0, 30),
      color: String(merged.color || "#5ea0ff").slice(0, 32),
      folder: String(merged.folder || "general").slice(0, 100),
      status: normalizeEventStatus(merged.status),
      location: String(merged.location || "").slice(0, 200),
      amount: normalizeAmountValue(merged.amount),
      people: normalizeList(merged.people),
      tags: normalizeList(merged.tags),
      externalLink: String(merged.externalLink || "").slice(0, 2000),
      attachments: normalizeAttachmentsForStorage(merged.attachments),
      sections: normalizeSectionsForStorage(merged.sections),
      showSectionSummary: Boolean(merged.showSectionSummary),
      visibilityMode: visibilitySettings.visibilityMode,
      visibleToEmails: visibilitySettings.visibleToEmails,
      customVisibleToEmails: visibilitySettings.customVisibleToEmails,
      customFields: normalizeCustomFields(merged.customFields),
      createdAt: Number(merged.createdAt) || Date.now(),
      updatedAt: Number(merged.updatedAt) || Date.now(),
      order: Number.isFinite(Number(merged.order)) ? Number(merged.order) : Date.now()
    };
  }

  function buildTrashDocumentPayload(eventItem, overrides = {}) {
    const payload = buildEventDocumentPayload(eventItem, overrides);
    return {
      ...payload,
      originalEventId: String(overrides.originalEventId || eventItem.originalEventId || "").slice(0, 200)
    };
  }

  function getActiveDrawerEvent() {
    return events.find((event) => event.id === activeDrawerEventId) || null;
  }

  function closeEventDrawer() {
    activeDrawerEventId = null;
    drawerSectionDrafts = {};
  }

  function getSectionDraft(sectionId, section) {
    if (!drawerSectionDrafts[sectionId]) {
      drawerSectionDrafts[sectionId] = {
        editingItemId: null,
        title: "",
        summary: "",
        date: "",
        status: "planned",
        notes: ""
      };
    }

    return drawerSectionDrafts[sectionId];
  }

  function populateSectionDraft(sectionId, item) {
    drawerSectionDrafts[sectionId] = {
      editingItemId: item?.id || null,
      title: item?.title || "",
      summary: item?.summary || "",
      date: item?.date || "",
      status: item?.status || "planned",
      notes: item?.notes || ""
    };
  }

  async function saveEventSections(eventId, nextSections, successMessage = "Milestone updated.") {
    const activeEvent = events.find((event) => event.id === eventId);
    if (!activeEvent) return;
    if (!ensureWorkspaceEditAccess("edit subfolders and mini events")) return;

    await updateDoc(
      doc(db, "events", eventId),
      buildEventDocumentPayload(activeEvent, {
        sections: normalizeSections(nextSections),
        updatedAt: Date.now()
      })
    );
    if (successMessage) {
      setStatus(successMessage, "success");
    }
  }

  async function renameDrawerSection(sectionId, nextTitle) {
    const activeEvent = getActiveDrawerEvent();
    if (!activeEvent) return;

    const cleanedTitle = String(nextTitle || "").trim();
    if (!cleanedTitle) {
      render();
      return;
    }

    const nextSections = activeEvent.sections.map((section) =>
      section.id === sectionId ? { ...section, title: cleanedTitle } : section
    );
    await saveEventSections(activeEvent.id, nextSections, "Subfolder renamed.");
  }

  async function removeDrawerSection(sectionId) {
    const activeEvent = getActiveDrawerEvent();
    if (!activeEvent) return;
    if (!ensureWorkspaceEditAccess("remove subfolders")) return;

    const targetSection = activeEvent.sections.find((section) => section.id === sectionId);
    if (!targetSection) return;

    const allAttachments = [
      ...targetSection.attachments,
      ...targetSection.items.flatMap((item) => item.attachments || [])
    ];
    await deleteStoredAttachments(allAttachments);
    const nextSections = activeEvent.sections.filter((section) => section.id !== sectionId);
    delete drawerSectionDrafts[sectionId];
    await saveEventSections(activeEvent.id, nextSections, "Subfolder removed.");
  }

  async function saveDrawerSubEvent(sectionId) {
    const activeEvent = getActiveDrawerEvent();
    if (!activeEvent) return;
    if (!ensureWorkspaceEditAccess("save mini events")) return;

    const targetSection = activeEvent.sections.find((section) => section.id === sectionId);
    const draft = getSectionDraft(sectionId);
    const titleValue = String(draft.title || "").trim();

    if (!targetSection || !titleValue) {
      setStatus("Give the mini event a title first.", "error");
      return;
    }

    const nextItem = {
      id: draft.editingItemId || `subevent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: titleValue,
      summary: draft.summary || "",
      date: draft.date || "",
      status: draft.status || "planned",
      notes: draft.notes || "",
      attachments: targetSection.items.find((item) => item.id === draft.editingItemId)?.attachments || []
    };

    const nextSections = activeEvent.sections.map((section) => {
      if (section.id !== sectionId) return section;

      const remainingItems = section.items.filter((item) => item.id !== nextItem.id);
      return {
        ...section,
        items: normalizeSubEvents([...remainingItems, nextItem])
      };
    });

    populateSectionDraft(sectionId, null);
    await saveEventSections(activeEvent.id, nextSections, "Mini event saved.");
  }

  function startDrawerSubEventEdit(sectionId, itemId) {
    if (!ensureWorkspaceEditAccess("edit mini events")) return;
    const activeEvent = getActiveDrawerEvent();
    const section = activeEvent?.sections.find((entry) => entry.id === sectionId);
    const item = section?.items.find((entry) => entry.id === itemId);
    if (!item) return;

    populateSectionDraft(sectionId, item);
    render();
  }

  async function deleteDrawerSubEvent(sectionId, itemId) {
    const activeEvent = getActiveDrawerEvent();
    if (!activeEvent) return;
    if (!ensureWorkspaceEditAccess("delete mini events")) return;

    const nextSections = activeEvent.sections.map((section) => {
      if (section.id !== sectionId) return section;

      const targetItem = section.items.find((item) => item.id === itemId);
      if (targetItem?.attachments?.length) {
        void deleteStoredAttachments(targetItem.attachments);
      }

      return {
        ...section,
        items: section.items.filter((item) => item.id !== itemId)
      };
    });

    populateSectionDraft(sectionId, null);
    await saveEventSections(activeEvent.id, nextSections, "Mini event removed.");
  }

  function resetAppState() {
    deleteDraftAttachments();
    userProfileUnsubscribe?.();
    workspaceProfileUnsubscribe?.();
    folderDocUnsubscribe?.();
    dashboardDocUnsubscribe?.();
    composerDocUnsubscribe?.();
    eventsUnsubscribe?.();
    trashUnsubscribe?.();
    userProfileUnsubscribe = null;
    workspaceProfileUnsubscribe = null;
    folderDocUnsubscribe = null;
    dashboardDocUnsubscribe = null;
    composerDocUnsubscribe = null;
    eventsUnsubscribe = null;
    trashUnsubscribe = null;
    user = null;
    userProfile = { plan: "free" };
    workspaceProfile = null;
    workspaceOwnerUid = "";
    events = [];
    trash = [];
    customFolders = [];
    dashboardPreferences = { ...defaultDashboardPreferences };
    composerPreferences = { ...defaultComposerPreferences };
    activeFolder = "all";
    activeSection = "dashboard";
    searchQuery = "";
    statusFilter = "all";
    sortMode = "custom";
    activeViewGraph = "table";
    creatorClaimAttempted = false;
    authorizedWorkspaceClaimAttempted = false;
    editingId = null;
    attachingEventId = null;
    attachingSectionId = null;
    attachingSubEventId = null;
    activeDrawerEventId = null;
    drawerSectionDrafts = {};
    suppressDrawerOpenUntil = 0;
    selectedAttachments = [];
    selectedSections = [];
    selectedVisibleToEmails = [];
    email.value = "";
    password.value = "";
    confirmPassword.value = "";
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmNewPasswordInput.value = "";
    deleteAccountReasonInput.value = "";
    deleteAccountImprovementInput.value = "";
    searchInput.value = "";
    statusFilterInput.value = "all";
    sortSelect.value = "custom";
    timeline.innerHTML = "";
    tableBody.innerHTML = "";
    verticalTimeline.innerHTML = "";
    spotlightGraph.innerHTML = "";
    trashList.innerHTML = "";
    planStatus.innerHTML = "";
    upgradePanel.innerHTML = "";
    settingsPlanPanel.innerHTML = "";
    applyDashboardPreferences();
    applyComposerPreferences();
    renderCustomFieldEditor();
    clearDeletionSelections();
    syncDeletionLinks();
    syncDeleteOptionAvailability();
    setStatus("");
  }

  function subscribeToUserProfile() {
    userProfileUnsubscribe?.();

    const userDocRef = getUserDocRef();
    userProfileUnsubscribe = onSnapshot(userDocRef, async (snapshot) => {
      if (!snapshot.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: getCurrentUserEmail(),
          plan: "free",
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        await claimCreatorPlanIfRequested();
        await claimAuthorizedWorkspaceIfNeeded();
        return;
      }

      const data = snapshot.data() || {};
      userProfile = {
        ...data,
        email: normalizeEmail(data.email || getCurrentUserEmail()),
        plan: normalizePlanKey(data.plan)
      };
      await claimCreatorPlanIfRequested();
      await claimAuthorizedWorkspaceIfNeeded();
      subscribeToWorkspaceProfile();
      renderPlanSurfaces();
      syncDeletionLinks();
      renderVisibilityControls(editingId ? events.find((event) => event.id === editingId) : null);
      renderAuthorizedUsersPanel();
      render();
    });
  }

  function subscribeToWorkspaceProfile() {
    workspaceProfileUnsubscribe?.();

    const candidateWorkspaceOwnerUid = userProfile.workspaceOwnerUid || user.uid;
    workspaceOwnerUid = candidateWorkspaceOwnerUid;

    workspaceProfileUnsubscribe = onSnapshot(
      getWorkspaceDocRef(candidateWorkspaceOwnerUid),
      (snapshot) => {
        const workspaceData = snapshot.data() || {};
        const normalizedWorkspaceProfile = {
          ...workspaceData,
          uid: workspaceData.uid || candidateWorkspaceOwnerUid,
          email: normalizeEmail(workspaceData.email || (candidateWorkspaceOwnerUid === user.uid ? getCurrentUserEmail() : "")),
          plan: normalizePlanKey(workspaceData.plan),
          authorizedUsers: normalizeAuthorizedUsers(workspaceData.authorizedUsers),
          authorizedUserEmails: normalizeEmailList(
            workspaceData.authorizedUserEmails ||
            normalizeAuthorizedUsers(workspaceData.authorizedUsers).map((entry) => entry.email)
          )
        };

        if (!snapshot.exists() || !doesWorkspaceAuthorizeCurrentUser(normalizedWorkspaceProfile)) {
          workspaceOwnerUid = user.uid;
          workspaceProfile = {
            ...userProfile,
            uid: user.uid,
            email: normalizeEmail(userProfile.email || getCurrentUserEmail()),
            authorizedUsers: normalizeAuthorizedUsers(userProfile.authorizedUsers),
            authorizedUserEmails: normalizeEmailList(userProfile.authorizedUserEmails)
          };
        } else {
          workspaceOwnerUid = candidateWorkspaceOwnerUid;
          workspaceProfile = normalizedWorkspaceProfile;
        }

        syncWorkspaceSubscriptions();
      },
      () => {
        workspaceOwnerUid = user.uid;
        workspaceProfile = {
          ...userProfile,
          uid: user.uid,
          email: normalizeEmail(userProfile.email || getCurrentUserEmail()),
          authorizedUsers: normalizeAuthorizedUsers(userProfile.authorizedUsers),
          authorizedUserEmails: normalizeEmailList(userProfile.authorizedUserEmails)
        };
        syncWorkspaceSubscriptions();
      }
    );
  }

  function syncWorkspaceSubscriptions() {
    if (!user || !workspaceOwnerUid) return;

    if (!editingId) {
      selectedVisibleToEmails = resolveWorkspaceVisibilitySettings().visibleToEmails;
    }

    subscribeToFolderProfile();
    loadEvents();
    loadTrash();
    renderFolderControls();
    renderPlanSurfaces();
    syncDeletionLinks();
    syncDeleteOptionAvailability();
    renderVisibilityControls(editingId ? events.find((event) => event.id === editingId) : null);
    renderAuthorizedUsersPanel();
    render();
  }

  async function claimCreatorPlanIfRequested() {
    if (creatorClaimAttempted || !shouldClaimCreatorPlan() || getCurrentPlanKey() !== "free") return;

    creatorClaimAttempted = true;
    const manualClaimRequested = new URLSearchParams(window.location.search).get("creator") === "1";

    try {
      const claimCreatorPlan = httpsCallable(functions, "claimCreatorPlan");
      const result = await claimCreatorPlan({ idToken: await getFreshIdToken() });
      const nextPlanKey = normalizePlanKey(result?.data?.plan || "family");
      const nextPlanLabel = planLimits[nextPlanKey]?.label || "paid";
      setStatus(`Creator access granted. Your account is on the ${nextPlanLabel} plan.`, "success");
    } catch (error) {
      if (!manualClaimRequested && error?.code === "functions/permission-denied") {
        return;
      }
      console.error(error);
      setStatus(error?.message || "Creator access could not be granted for this signed-in email.", "error");
    }
  }

  async function claimAuthorizedWorkspaceIfNeeded() {
    if (authorizedWorkspaceClaimAttempted || !user || !getCurrentUserEmail()) return;

    authorizedWorkspaceClaimAttempted = true;

    try {
      const claimAuthorizedWorkspace = httpsCallable(functions, "claimAuthorizedWorkspace");
      const result = await claimAuthorizedWorkspace({ idToken: await getFreshIdToken() });

      if (result.data?.linked) {
        setStatus(`Shared access connected through ${result.data.ownerEmail}.`, "success");
      }
    } catch (error) {
      console.error(error);
    }
  }

  function shouldClaimCreatorPlan() {
    return new URLSearchParams(window.location.search).get("creator") === "1" ||
      getCurrentUserEmail().endsWith("@chroniclecanvas.us");
  }

  async function getFreshIdToken() {
    const currentUser = auth.currentUser || user;

    if (!currentUser) {
      throw new Error("Sign in before continuing.");
    }

    return currentUser.getIdToken(true);
  }

  function setStatus(message, tone = "info") {
    const target = app?.style.display === "flex" ? statusBanner : authStatus;
    if (!target) return;

    if (!message) {
      target.style.display = "none";
      target.textContent = "";
      target.className = target === authStatus ? "statusBanner authStatus" : "statusBanner";
      return;
    }

    target.style.display = "block";
    target.textContent = message;
    target.className = `${target === authStatus ? "statusBanner authStatus" : "statusBanner"} ${tone}`;

    if (tone !== "error") {
      window.clearTimeout(setStatus.timeoutId);
      setStatus.timeoutId = window.setTimeout(() => {
        target.style.display = "none";
      }, 2500);
    }
  }

  async function withBusy(button, label, task) {
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = label;

    try {
      await task();
      return true;
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Something went wrong. Please try again.", "error");
      return false;
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  function getCurrentPlanKey() {
    return normalizePlanKey(getEffectiveWorkspaceData().plan);
  }

  function getCurrentPlan() {
    return planLimits[getCurrentPlanKey()];
  }

  function getCustomFolderCount() {
    return customFolders.length;
  }

  function getStorageUsedBytes() {
    const allItems = [...events, ...trash];
    return allItems.reduce((total, item) => {
      const eventAttachmentBytes = item.attachments.reduce((sum, attachment) => sum + (Number(attachment.size) || 0), 0);
      const sectionAttachmentBytes = item.sections.reduce((sum, section) => {
        const subfolderBytes = section.attachments.reduce(
          (sectionSum, attachment) => sectionSum + (Number(attachment.size) || 0),
          0
        );
        const subEventBytes = (section.items || []).reduce(
          (itemSum, nestedItem) =>
            itemSum +
            (nestedItem.attachments || []).reduce(
              (attachmentSum, attachment) => attachmentSum + (Number(attachment.size) || 0),
              0
            ),
          0
        );
        return sum + subfolderBytes + subEventBytes;
      }, 0);
      return total + eventAttachmentBytes + sectionAttachmentBytes;
    }, 0);
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = Number(bytes);
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value >= 10 || unitIndex < 2 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
  }

  function getUpgradeMessage(feature) {
    const plan = getCurrentPlan();

    if (feature === "attachments") {
      return `${plan.label} does not include attachments. Upgrade to Home to add photos, receipts, and documents.`;
    }

    if (feature === "exports") {
      return `${plan.label} does not include full exports. Upgrade to Home to download CSV backups.`;
    }

    if (feature === "events") {
      return `${plan.label} includes ${plan.eventLimit} milestones. Upgrade to keep building your timeline.`;
    }

    if (feature === "folders") {
      return `${plan.label} includes ${plan.folderLimit} custom folders. Upgrade to organize more areas of life.`;
    }

    if (feature === "sharing") {
      return `${plan.label} does not include authorized-user sharing. Upgrade to Home or Advanced to share access while keeping visibility controls in your hands.`;
    }

    return "Upgrade to unlock this feature.";
  }

  function showUpgradePrompt(feature) {
    setStatus(getUpgradeMessage(feature), "error");
    renderPlanSurfaces();
    const planPanelTarget = getCurrentPlanKey() === "free" ? upgradePanel : settingsPlanPanel;

    if (getCurrentPlanKey() === "free") {
      showSection(dashboardView, dashboardTab);
    } else {
      showSection(settingsView, settingsTab);
    }

    planPanelTarget.hidden = false;
    planPanelTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  jumpToComposerBtn.onclick = () => showSection(timelineView, timelineTab);
  openStoryBtn.onclick = () => showSection(storyView, storyTab);
  selectFilesBtn.onclick = () => openAttachmentPicker();

  addBtn.onclick = async () => {
    if (!user) return;
    if (!ensureWorkspaceEditAccess(editingId ? "save shared milestones" : "add shared milestones")) return;

    const titleValue = title.value.trim();
    const summaryValue = summary.value.trim();
    const notesValue = notes.value.trim();

    if (!titleValue || !startDate.value) {
      alert("Add a title and start date before saving.");
      return;
    }

    if (!editingId && events.length >= getCurrentPlan().eventLimit) {
      showUpgradePrompt("events");
      return;
    }

    const existingEvent = events.find((event) => event.id === editingId);
    const payload = buildEventDocumentPayload(existingEvent || {
      uid: getWorkspaceOwnerUid(),
      createdByUid: user.uid,
      createdAt: Date.now(),
      order: getNextOrder()
    }, {
      title: titleValue,
      summary: summaryValue,
      notes: notesValue,
      startDate: startDate.value,
      endDate: endDate.value || "",
      reminderDate: reminderDate.value || "",
      color: selectedColor,
      folder: folderSelect.value || "general",
      status: statusSelectInput.value || "planned",
      location: locationInput.value.trim(),
      amount: amountInput.value ? Number(amountInput.value) : null,
      people: parseListInput(peopleInput.value),
      tags: parseListInput(tagsInput.value),
      externalLink: externalLinkInput.value.trim(),
      attachments: [...selectedAttachments],
      sections: normalizeSections(selectedSections),
      visibilityMode: listsMatch(selectedVisibleToEmails, getWorkspaceViewerEmails(folderSelect.value || "general")) ? "workspace" : "custom",
      visibleToEmails: [...selectedVisibleToEmails],
      customVisibleToEmails: [...selectedVisibleToEmails],
      customFields: normalizeCustomFields(selectedCustomFields),
      updatedAt: Date.now(),
      order: existingEvent?.order ?? getNextOrder()
    });
    const removedSectionAttachments = existingEvent
      ? getRemovedSectionAttachments(existingEvent.sections, payload.sections)
      : [];
    const removedEventAttachments = existingEvent
      ? getRemovedAttachments(existingEvent.attachments, payload.attachments)
      : [];

    const saved = await withBusy(addBtn, editingId ? "Saving..." : "Adding...", async () => {
      if (editingId) {
        await updateDoc(doc(db, "events", editingId), payload);
        if (removedEventAttachments.length) {
          await deleteStoredAttachments(removedEventAttachments);
        }
        if (removedSectionAttachments.length) {
          await deleteStoredAttachments(removedSectionAttachments);
        }
        setStatus("Milestone updated.", "success");
      } else {
        await addDoc(collection(db, "events"), payload);
        setStatus("Milestone added.", "success");
      }
    });

    if (saved) {
      resetForm({ deleteDrafts: false });
      showSection(dashboardView, dashboardTab);
    }
  };

  function setupTabs() {
    dashboardTab.onclick = () => showSection(dashboardView, dashboardTab);
    timelineTab.onclick = () => showSection(timelineView, timelineTab);
    viewsTab.onclick = () => showSection(viewsView, viewsTab);
    storyTab.onclick = () => showSection(storyView, storyTab);
    trashTab.onclick = () => showSection(trashView, trashTab);
    settingsTab.onclick = () => showSection(settingsView, settingsTab);
  }

  function showSection(view, tab) {
    if (view === dashboardView) activeSection = "dashboard";
    if (view === timelineView) activeSection = "timeline";
    if (view === viewsView) activeSection = "views";
    if (view === storyView) activeSection = "story";
    if (view === trashView) activeSection = "trash";
    if (view === settingsView) activeSection = "settings";

    [dashboardView, timelineView, viewsView, storyView, trashView, settingsView].forEach((panel) => {
      panel.style.display = "none";
    });

    view.style.display = "block";

    document.querySelectorAll(".tab").forEach((tabButton) => {
      tabButton.classList.remove("active");
    });

    tab.classList.add("active");

    revealSectionArrival(view, tab.textContent);

    if (view !== timelineView && activeDrawerEventId) {
      closeEventDrawer();
    }

    if (user) {
      render();
    }
  }

  function revealSectionArrival(view, label) {
    window.scrollTo({ top: 0, behavior: "auto" });
    main?.scrollTo?.({ top: 0, behavior: "auto" });
    view?.scrollIntoView({ behavior: "auto", block: "start" });

    const arrivalTarget = getSectionArrivalTarget(view);

    if (arrivalTarget) {
      arrivalTarget.classList.remove("sectionArrivalFlash");
      void arrivalTarget.offsetWidth;
      arrivalTarget.classList.add("sectionArrivalFlash");
      window.setTimeout(() => {
        arrivalTarget.classList.remove("sectionArrivalFlash");
      }, 1600);
    }

    showSectionArrivalToast(`${label} opened`);

    if (view === settingsView && settingsArrivalBadge) {
      settingsArrivalBadge.hidden = false;
      settingsArrivalBadge.classList.remove("active");
      void settingsArrivalBadge.offsetWidth;
      settingsArrivalBadge.classList.add("active");
      window.setTimeout(() => {
        settingsArrivalBadge.classList.remove("active");
        settingsArrivalBadge.hidden = true;
      }, 1900);
    }
  }

  function getSectionArrivalTarget(view) {
    if (!view) return null;
    return view.firstElementChild || view;
  }

  function showSectionArrivalToast(message, soft = false) {
    if (!sectionArrivalToast) return;

    sectionArrivalToast.textContent = message;
    sectionArrivalToast.hidden = false;
    sectionArrivalToast.classList.toggle("soft", soft);
    sectionArrivalToast.classList.remove("active");
    void sectionArrivalToast.offsetWidth;
    sectionArrivalToast.classList.add("active");
    window.setTimeout(() => {
      sectionArrivalToast.classList.remove("active");
      sectionArrivalToast.hidden = true;
    }, soft ? 1200 : 1700);
  }

  function setupFilters() {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      render();
    });

    statusFilterInput.addEventListener("change", () => {
      statusFilter = statusFilterInput.value;
      render();
    });

    sortSelect.addEventListener("change", () => {
      sortMode = sortSelect.value;
      render();
    });

    clearFiltersBtn.onclick = () => {
      searchQuery = "";
      statusFilter = "all";
      sortMode = "custom";
      activeFolder = "all";
      searchInput.value = "";
      statusFilterInput.value = "all";
      sortSelect.value = "custom";
      renderFolderControls();
      render();
    };
  }

  function setupStoryActions() {
    printStoryBtn.onclick = () => window.print();
    exportCsvBtn.onclick = () => {
      if (!getCurrentPlan().exports) {
        showUpgradePrompt("exports");
        return;
      }

      downloadExport("chronicle-canvas-export.csv", buildCsvExport(getSortedEvents()), "text/csv");
    };

    copyStoryBtn.onclick = async () => {
      const storyText = buildStorySummary(getVisibleEvents());

      try {
        await navigator.clipboard.writeText(storyText);
        copyStoryBtn.textContent = "Copied";
        setTimeout(() => {
          copyStoryBtn.textContent = "Copy Story Summary";
        }, 1500);
      } catch {
        alert("Copy did not work in this browser, but the story view is ready to print.");
      }
    };
  }

  function downloadExport(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`${filename} downloaded.`, "success");
  }

  function buildCsvExport(sourceEvents) {
    const headers = ["Title", "Summary", "Folder", "Status", "Start Date", "End Date", "Reminder", "Location", "Amount", "People", "Tags", "Custom Details", "Subfolders", "Link"];
    const rows = sourceEvents.map((event) => [
      event.title,
      event.summary,
      formatFolderLabel(event.folder),
      formatFolderLabel(event.status),
      event.startDate,
      event.endDate,
      event.reminderDate,
      event.location,
      event.amount ?? "",
      event.people.join("; "),
      event.tags.join("; "),
      event.customFields.map((field) => `${field.label}: ${field.value}`).join("; "),
      event.sections.map((section) => section.title).join("; "),
      event.externalLink
    ]);

    return [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`)
          .join(",")
      )
      .join("\n");
  }

  function setupFolderCreator() {
    addFolderBtn.onclick = addFolderFromInput;
    newFolderInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addFolderFromInput();
      }
    });
  }

  function addFolderFromInput() {
    if (!ensureWorkspaceEditAccess("add folders")) return;
    const nextFolder = sanitizeFolderValue(newFolderInput.value);

    if (!nextFolder) {
      alert("Type a folder name first.");
      return;
    }

    if (getAllFolderValues().includes(nextFolder)) {
      alert("That folder already exists.");
      return;
    }

    if (getCustomFolderCount() >= getCurrentPlan().folderLimit) {
      showUpgradePrompt("folders");
      return;
    }

    customFolders = sortFolderValues([...customFolders, nextFolder]);
    renderFolderControls();
    folderSelect.value = nextFolder;
    newFolderInput.value = "";
    setStatus(`Folder "${formatFolderLabel(nextFolder)}" added.`, "success");
    void saveCustomFolders(customFolders);
  }

  function subscribeToFolderProfile() {
    folderDocUnsubscribe?.();

    const folderDocRef = getFolderDocRef();
    const legacyFolders = loadLegacyLocalFolders();

    folderDocUnsubscribe = onSnapshot(folderDocRef, async (snapshot) => {
      const remoteFolders = Array.isArray(snapshot.data()?.customFolders)
        ? sortFolderValues(snapshot.data().customFolders.map(sanitizeFolderValue).filter(Boolean))
        : [];

      if (legacyFolders.length) {
        const mergedFolders = sortFolderValues([...remoteFolders, ...legacyFolders]);

        if (mergedFolders.length !== remoteFolders.length && canCurrentUserEditWorkspace()) {
          await saveCustomFolders(mergedFolders);
          clearLegacyLocalFolders();
          return;
        }

        clearLegacyLocalFolders();
      }

      customFolders = remoteFolders;
      renderFolderControls();
    });
  }

  async function saveCustomFolders(nextFolders = customFolders) {
    if (!ensureWorkspaceEditAccess("change folders")) return;
    const normalizedFolders = sortFolderValues(nextFolders.map(sanitizeFolderValue).filter(Boolean));

    await setDoc(
      getFolderDocRef(),
      {
        uid: getWorkspaceOwnerUid() || user.uid,
        customFolders: normalizedFolders,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }

  function subscribeToDashboardProfile() {
    dashboardDocUnsubscribe?.();

    dashboardDocUnsubscribe = onSnapshot(getDashboardDocRef(), (snapshot) => {
      dashboardPreferences = normalizeDashboardPreferences(snapshot.data() || {});
      applyDashboardPreferences();
      render();
    });
  }

  async function saveDashboardPreferences(nextPreferences = dashboardPreferences) {
    if (!user) return;

    const normalizedPreferences = normalizeDashboardPreferences(nextPreferences);
    await setDoc(
      getDashboardDocRef(),
      {
        uid: user.uid,
        ...normalizedPreferences,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }

  function subscribeToComposerProfile() {
    composerDocUnsubscribe?.();

    composerDocUnsubscribe = onSnapshot(getComposerDocRef(), (snapshot) => {
      composerPreferences = normalizeComposerPreferences(snapshot.data() || {});
      applyComposerPreferences();
    });
  }

  async function saveComposerPreferences(nextPreferences = composerPreferences) {
    if (!user) return;

    const normalizedPreferences = normalizeComposerPreferences(nextPreferences);
    await setDoc(
      getComposerDocRef(),
      {
        uid: user.uid,
        ...normalizedPreferences,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }

  function getUserDocRef() {
    return doc(db, "users", user.uid);
  }

  function getWorkspaceDocRef(ownerUid = getWorkspaceOwnerUid() || user?.uid) {
    return doc(db, "users", ownerUid, "preferences", "workspace");
  }

  function getFolderDocRef() {
    return doc(db, "users", getWorkspaceOwnerUid() || user.uid, "preferences", "folders");
  }

  function getDashboardDocRef() {
    return doc(db, "users", user.uid, "preferences", "dashboard");
  }

  function getComposerDocRef() {
    return doc(db, "users", user.uid, "preferences", "composer");
  }

  function loadLegacyLocalFolders() {
    try {
      const saved = localStorage.getItem(getLegacyFolderStorageKey());
      const parsed = JSON.parse(saved || "[]");
      return Array.isArray(parsed)
        ? sortFolderValues(parsed.map(sanitizeFolderValue).filter(Boolean))
        : [];
    } catch {
      return [];
    }
  }

  function clearLegacyLocalFolders() {
    localStorage.removeItem(getLegacyFolderStorageKey());
  }

  function getLegacyFolderStorageKey() {
    return `timelineFolders_${user?.uid || "guest"}`;
  }
  function loadEvents() {
    eventsUnsubscribe?.();

    const workspaceUid = getWorkspaceOwnerUid();
    const currentEmail = getCurrentUserEmail();
    const eventsQuery = canCurrentUserManageWorkspace()
      ? query(collection(db, "events"), where("uid", "==", workspaceUid))
      : query(
          collection(db, "events"),
          where("uid", "==", workspaceUid),
          where("visibleToEmails", "array-contains", currentEmail)
        );

    eventsUnsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      events = snapshot.docs.map((snapshotDoc) =>
        normalizeItem({ id: snapshotDoc.id, ...snapshotDoc.data() })
      ).filter((item) => item.uid === workspaceUid && canCurrentUserSeeFolder(item.folder));
      syncFoldersFromEvents();
      render();
      void hydrateAttachmentUrlsForList(events, (nextItems) => {
        events = nextItems;
        render();
      });
    });
  }

  function loadTrash() {
    trashUnsubscribe?.();

    const workspaceUid = getWorkspaceOwnerUid();
    const currentEmail = getCurrentUserEmail();
    const trashQuery = canCurrentUserManageWorkspace()
      ? query(collection(db, "trash"), where("uid", "==", workspaceUid))
      : query(
          collection(db, "trash"),
          where("uid", "==", workspaceUid),
          where("visibleToEmails", "array-contains", currentEmail)
        );

    trashUnsubscribe = onSnapshot(trashQuery, (snapshot) => {
      trash = snapshot.docs.map((snapshotDoc) =>
        normalizeItem({ trashId: snapshotDoc.id, ...snapshotDoc.data() })
      ).filter((item) => item.uid === workspaceUid && canCurrentUserSeeFolder(item.folder));
      renderTrash();
      void hydrateAttachmentUrlsForList(trash, (nextItems) => {
        trash = nextItems;
        renderTrash();
      });
    });
  }

  function normalizeItem(item) {
    const visibilitySettings = resolveWorkspaceVisibilitySettings(item);

    return {
      ...item,
      title: item.title || "Untitled Event",
      summary: item.summary || "",
      notes: item.notes || "",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      reminderDate: item.reminderDate || "",
      color: item.color || "#5ea0ff",
      folder: item.folder || "general",
      status: normalizeEventStatus(item.status),
      location: item.location || "",
      amount: normalizeAmountValue(item.amount),
      people: normalizeList(item.people),
      tags: normalizeList(item.tags),
      externalLink: item.externalLink || "",
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : Number(item.createdAt || Date.now()),
      createdByUid: item.createdByUid || item.uid || "",
      attachments: normalizeAttachments(item.attachments),
      sections: normalizeSections(item.sections),
      showSectionSummary: Boolean(item.showSectionSummary),
      visibilityMode: visibilitySettings.visibilityMode,
      visibleToEmails: visibilitySettings.visibleToEmails,
      customVisibleToEmails: visibilitySettings.customVisibleToEmails,
      customFields: normalizeCustomFields(item.customFields)
    };
  }

  function normalizeList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
      return parseListInput(value);
    }

    return [];
  }

  function parseListInput(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function attachmentLooksLikeImage(attachment) {
    const typeValue = String(attachment?.type || "").toLowerCase();
    if (typeValue.startsWith("image/")) return true;

    const source = String(
      attachment?.name ||
      attachment?.url ||
      attachment?.storagePath ||
      ""
    ).toLowerCase();

    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"].some((extension) =>
      source.includes(extension)
    );
  }

  function normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) return [];

    return attachments
      .map((attachment) => {
        if (!attachment) return null;

      if (typeof attachment === "string") {
          return {
            name: attachment,
            type: "",
            url: "",
            viewable: false,
            isImage: attachmentLooksLikeImage({ name: attachment }),
            storagePath: "",
            unresolved: true
          };
        }

        const persistedUrl = attachment.storagePath ? "" : (attachment.url || "");
        return {
          name: attachment.name || "Untitled file",
          type: attachment.type || "",
          url: persistedUrl,
          viewable: Boolean(persistedUrl || attachment.storagePath),
          isImage: attachmentLooksLikeImage({ ...attachment, url: persistedUrl }),
          size: Number(attachment.size) || 0,
          storagePath: attachment.storagePath || "",
          unresolved: !persistedUrl && !attachment.storagePath
        };
      })
      .filter(Boolean);
  }

  function normalizeAttachmentsForStorage(attachments) {
    return normalizeAttachments(attachments).map((attachment) => ({
      ...attachment,
      url: "",
      viewable: Boolean(attachment.storagePath),
      isImage: attachmentLooksLikeImage(attachment),
      unresolved: !attachment.storagePath
    }));
  }

  async function hydrateAttachmentUrlsForList(items, apply) {
    let didChange = false;

    const nextItems = await Promise.all(items.map(async (item) => {
      const hydratedItem = await hydrateAttachmentUrlsForItem(item);
      if (hydratedItem !== item) {
        didChange = true;
      }
      return hydratedItem;
    }));

    if (didChange) {
      apply(nextItems);
    }
  }

  async function hydrateAttachmentUrlsForItem(item) {
    const hydratedAttachments = await hydrateAttachments(item.attachments);
    const hydratedSections = await Promise.all(
      (item.sections || []).map(async (section) => {
        const nextAttachments = await hydrateAttachments(section.attachments);
        const nextItems = await Promise.all(
          (section.items || []).map(async (subItem) => {
            const nextSubAttachments = await hydrateAttachments(subItem.attachments);
            return nextSubAttachments === subItem.attachments
              ? subItem
              : { ...subItem, attachments: nextSubAttachments };
          })
        );

        const sectionChanged = nextAttachments !== section.attachments ||
          nextItems.some((subItem, index) => subItem !== section.items[index]);

        return sectionChanged
          ? { ...section, attachments: nextAttachments, items: nextItems }
          : section;
      })
    );

    const changed = hydratedAttachments !== item.attachments ||
      hydratedSections.some((section, index) => section !== item.sections[index]);

    return changed
      ? {
          ...item,
          attachments: hydratedAttachments,
          sections: hydratedSections
        }
      : item;
  }

  async function hydrateAttachments(attachments = []) {
    let didChange = false;

    const nextAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        if (!attachment?.storagePath || attachment.url) return attachment;

        const cachedUrl = attachmentUrlCache.get(attachment.storagePath);
        if (cachedUrl) {
          didChange = true;
          return {
            ...attachment,
            url: cachedUrl,
            viewable: true,
            isImage: attachmentLooksLikeImage({ ...attachment, url: cachedUrl })
          };
        }

        try {
          const resolvedUrl = await getDownloadURL(ref(storage, attachment.storagePath));
          attachmentUrlCache.set(attachment.storagePath, resolvedUrl);
          didChange = true;
          return {
            ...attachment,
            url: resolvedUrl,
            viewable: true,
            isImage: attachmentLooksLikeImage({ ...attachment, url: resolvedUrl })
          };
        } catch {
          return attachment;
        }
      })
    );

    return didChange ? nextAttachments : attachments;
  }

  function syncFoldersFromEvents() {
    const knownFolders = getAllFolderValues();
    const eventFolders = events
      .map((event) => sanitizeFolderValue(event.folder))
      .filter((folder) => folder && !knownFolders.includes(folder));

    if (!eventFolders.length) return;

    customFolders = sortFolderValues([...customFolders, ...eventFolders]);
    renderFolderControls();
    void saveCustomFolders(customFolders);
  }

  function renderFolderControls() {
    const visibleFolderValues = getCurrentUserVisibleFolderValues();
    const folders = [
      { value: "all", label: "All" },
      ...defaultFolders.filter((folder) => visibleFolderValues.includes(folder.value)),
      ...customFolders
        .filter((folder) => visibleFolderValues.includes(folder))
        .map((folder) => ({ value: folder, label: formatFolderLabel(folder) }))
    ];

    if (!folders.some((folder) => folder.value === activeFolder)) {
      activeFolder = "all";
    }

    folderButtonList.innerHTML = folders
      .map(
        (folder) => `
          <button class="folderBtn${activeFolder === folder.value ? " active" : ""}" data-folder="${escapeHtml(folder.value)}" type="button">
            <span>${escapeHtml(folder.label)}</span>
          </button>
        `
      )
      .join("");

    folderButtonList.querySelectorAll(".folderBtn").forEach((button) => {
      button.onclick = () => {
        activeFolder = button.dataset.folder;
        renderFolderControls();
        render();
        cueActiveFolderButton(button.dataset.folder);
      };
    });

    folderCountPill.textContent = String(folders.length - 1);

    const previousValue = folderSelect.value;
    folderSelect.innerHTML = folders
      .filter((folder) => folder.value !== "all")
      .map((folder) => `<option value="${escapeHtml(folder.value)}">${escapeHtml(folder.label)}</option>`)
      .join("");

    const nextFolderValue = visibleFolderValues.includes(previousValue)
      ? previousValue
      : (visibleFolderValues[0] || defaultFolders[0].value);
    folderSelect.value = nextFolderValue;
  }

  function cueActiveFolderButton(folderValue) {
    const activeButton = Array.from(folderButtonList.querySelectorAll(".folderBtn"))
      .find((button) => button.dataset.folder === folderValue);

    if (!activeButton) return;

    activeButton.classList.remove("folderArrivalFlash");
    void activeButton.offsetWidth;
    activeButton.classList.add("folderArrivalFlash");
    window.setTimeout(() => {
      activeButton.classList.remove("folderArrivalFlash");
    }, 900);
    showSectionArrivalToast(`Folder: ${activeButton.textContent.trim()}`, true);
  }

  function getAllFolderValues() {
    return [...defaultFolders.map((folder) => folder.value), ...customFolders];
  }

  function sanitizeFolderValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function formatFolderLabel(value) {
    return String(value)
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function sortFolderValues(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
  }

  function getNextOrder() {
    if (!events.length) return 1;
    return Math.max(...events.map((event) => Number(event.order) || 0)) + 1;
  }

  function getComparableDate(event) {
    return event.startDate || event.reminderDate || "9999-12-31";
  }

  function getSortedEvents() {
    return [...events].sort((left, right) => {
      return (
        (Number(left.order) || 0) - (Number(right.order) || 0) ||
        getComparableDate(left).localeCompare(getComparableDate(right)) ||
        (left.createdAt || 0) - (right.createdAt || 0)
      );
    });
  }

  function matchesSearch(event) {
    if (!searchQuery) return true;

    const sectionHaystack = event.sections.flatMap((section) => [
      section.title,
      section.notes,
      ...section.attachments.map((attachment) => attachment.name),
      ...(section.items || []).flatMap((item) => [
        item.title,
        item.summary,
        item.notes,
        item.date,
        item.status,
        ...(item.attachments || []).map((attachment) => attachment.name)
      ])
    ]);
    const customFieldHaystack = event.customFields.flatMap((field) => [field.label, field.value]);

    const haystack = [
      event.title,
      event.summary,
      event.notes,
      event.location,
      event.externalLink,
      formatFolderLabel(event.folder),
      ...event.tags,
      ...event.people,
      ...sectionHaystack,
      ...customFieldHaystack
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery);
  }

  function getVisibleEvents() {
    let filtered = getSortedEvents().filter((event) => {
      const folderMatch = activeFolder === "all" || event.folder === activeFolder;
      const statusMatch = statusFilter === "all" || event.status === statusFilter;
      return folderMatch && statusMatch && matchesSearch(event);
    });

    switch (sortMode) {
      case "recent":
        filtered = [...filtered].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
        break;
      case "dateAsc":
        filtered = [...filtered].sort((left, right) => getComparableDate(left).localeCompare(getComparableDate(right)));
        break;
      case "dateDesc":
        filtered = [...filtered].sort((left, right) => getComparableDate(right).localeCompare(getComparableDate(left)));
        break;
      case "amountHigh":
        filtered = [...filtered].sort((left, right) => (right.amount || 0) - (left.amount || 0));
        break;
      default:
        break;
    }

    return filtered;
  }

  function setupColorPicker() {
    if (!colorInput || colorInput.dataset.ready === "true") return;

    const colors = [
      "#ff6b6b",
      "#ff8f3d",
      "#ffd166",
      "#7bd389",
      "#4ecdc4",
      "#5ea0ff",
      "#6f7bf7",
      "#b084f5",
      "#ff70a6",
      "#94a3b8"
    ];

    const swatchWrap = document.createElement("div");
    swatchWrap.className = "colorSwatches";

    colors.forEach((color) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "colorDot";
      dot.style.background = color;
      dot.setAttribute("aria-label", `Select ${color}`);
      dot.onclick = () => setSelectedColor(color);
      swatchWrap.appendChild(dot);
    });

    colorWheel = document.createElement("input");
    colorWheel.type = "color";
    colorWheel.value = selectedColor;
    colorWheel.className = "colorWheel";
    colorWheel.oninput = () => setSelectedColor(colorWheel.value);

    colorInput.style.display = "none";
    colorInput.dataset.ready = "true";
    colorInput.parentNode.appendChild(swatchWrap);
    colorInput.parentNode.appendChild(colorWheel);
  }

  function setSelectedColor(color) {
    selectedColor = color || "#5ea0ff";
    colorInput.value = selectedColor;
    if (colorWheel) colorWheel.value = selectedColor;
  }

  function setupAttachmentPicker() {
    if (!attachmentInput || attachmentInput.dataset.ready === "true") return;

    attachmentInput.dataset.ready = "true";

    attachmentInput.addEventListener("change", async () => {
      if (!ensureWorkspaceEditAccess("add files")) {
        attachmentInput.value = "";
        return;
      }

      const files = Array.from(attachmentInput.files || []);
      attachmentInput.value = "";

      if (!files.length) return;

      const attachments = await buildAttachments(files);
      if (!attachments.length) return;

      try {
        if (attachingEventId) {
          const targetEvent = events.find((event) => event.id === attachingEventId);

          if (!targetEvent) {
            attachingEventId = null;
            attachingSectionId = null;
            attachingSubEventId = null;
            return;
          }

          if (attachingSectionId && attachingSubEventId) {
            const nextSections = targetEvent.sections.map((section) => {
              if (section.id !== attachingSectionId) return section;

              return {
                ...section,
                items: section.items.map((item) =>
                  item.id === attachingSubEventId
                    ? { ...item, attachments: mergeAttachments(item.attachments, attachments) }
                    : item
                )
              };
            });
            await updateDoc(
              doc(db, "events", attachingEventId),
              buildEventDocumentPayload(targetEvent, {
                sections: normalizeSections(nextSections),
                updatedAt: Date.now()
              })
            );
          } else if (attachingSectionId) {
            const nextSections = targetEvent.sections.map((section) =>
              section.id === attachingSectionId
                ? { ...section, attachments: mergeAttachments(section.attachments, attachments) }
                : section
            );
            await updateDoc(
              doc(db, "events", attachingEventId),
              buildEventDocumentPayload(targetEvent, {
                sections: normalizeSections(nextSections),
                updatedAt: Date.now()
              })
            );
          } else {
            const nextAttachments = mergeAttachments(targetEvent.attachments, attachments);
            await updateDoc(
              doc(db, "events", attachingEventId),
              buildEventDocumentPayload(targetEvent, {
                attachments: nextAttachments,
                updatedAt: Date.now()
              })
            );
          }
          attachingEventId = null;
          attachingSectionId = null;
          attachingSubEventId = null;
          setStatus("Attachment uploaded.", "success");
          return;
        }

        selectedAttachments = mergeAttachments(selectedAttachments, attachments);
        attachingSectionId = null;
        attachingSubEventId = null;
        renderAttachmentPreview();
        setStatus("Attachment ready to save with this milestone.", "success");
      } catch (error) {
        console.error(error);
        attachingEventId = null;
        attachingSectionId = null;
        attachingSubEventId = null;
        await deleteStoredAttachments(attachments);
        setStatus(error?.message || "The file uploaded, but it could not be attached to this event yet. Please try again.", "error");
      }
    });
  }

  async function buildAttachments(files) {
    const attachments = [];
    const plan = getCurrentPlan();
    if (!ensureWorkspaceEditAccess("add files")) {
      return attachments;
    }
    const pendingDraftBytes = [
      ...selectedAttachments,
      ...selectedSections.flatMap((section) => getSectionAttachmentList(section))
    ]
      .filter((attachment) => attachment.storagePath?.includes("/draft_"))
      .reduce((sum, attachment) => sum + (Number(attachment.size) || 0), 0);

    if (!plan.storageLimitBytes || !plan.maxFileSizeBytes) {
      showUpgradePrompt("attachments");
      return attachments;
    }

    for (const file of files) {
      const nextStorageUsed =
        getStorageUsedBytes() +
        pendingDraftBytes +
        attachments.reduce((sum, attachment) => sum + attachment.size, 0) +
        file.size;

      if (file.size > plan.maxFileSizeBytes) {
        setStatus(`${file.name} is too large. ${plan.label} allows files up to ${formatBytes(plan.maxFileSizeBytes)}.`, "error");
        continue;
      }

      if (nextStorageUsed > plan.storageLimitBytes) {
        setStatus(`${file.name} would exceed your ${formatBytes(plan.storageLimitBytes)} storage limit.`, "error");
        continue;
      }

      try {
        const storagePath = buildAttachmentPath(file.name);
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, {
          contentType: file.type || "application/octet-stream"
        });
        const url = await getDownloadURL(storageRef);
        attachments.push({
          name: file.name,
          type: file.type || "",
          url,
          viewable: true,
          isImage: String(file.type || "").startsWith("image/"),
          size: file.size,
          storagePath
        });
      } catch {
        setStatus(`Could not upload ${file.name}. Try again.`, "error");
      }
    }

    return attachments;
  }

  function mergeAttachments(existing, incoming) {
    const merged = [...(existing || [])];

    incoming.forEach((incomingAttachment) => {
      const matchIndex = merged.findIndex(
        (existingAttachment) =>
          existingAttachment.name === incomingAttachment.name && existingAttachment.url === incomingAttachment.url
      );

      if (matchIndex === -1) {
        merged.push(incomingAttachment);
      } else {
        merged[matchIndex] = incomingAttachment;
      }
    });

    return merged;
  }

  function getRemovedAttachments(previousAttachments = [], nextAttachments = []) {
    const nextKeys = new Set(
      nextAttachments.map((attachment) => `${attachment.name}::${attachment.url || ""}::${attachment.storagePath || ""}`)
    );

    return previousAttachments.filter((attachment) => {
      const key = `${attachment.name}::${attachment.url || ""}::${attachment.storagePath || ""}`;
      return !nextKeys.has(key);
    });
  }

  function buildAttachmentPath(fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const eventKey = attachingEventId || `draft_${Date.now()}`;
    const sectionKey = attachingSectionId ? `section_${attachingSectionId}` : "event";
    const itemKey = attachingSubEventId ? `item_${attachingSubEventId}` : "main";
    return `users/${getWorkspaceOwnerUid() || user.uid}/attachments/${eventKey}/${sectionKey}/${itemKey}/${Date.now()}_${safeName}`;
  }

  function deleteDraftAttachments() {
    const draftAttachments = [
      ...selectedAttachments,
      ...selectedSections.flatMap((section) => getSectionAttachmentList(section))
    ].filter((attachment) => attachment.storagePath?.includes("/draft_"));

    if (!draftAttachments.length) return;

    void deleteStoredAttachments(draftAttachments);
  }

  async function deleteStoredAttachments(attachments) {
    const storagePaths = [...new Set(
      attachments
        .map((attachment) => attachment.storagePath)
        .filter(Boolean)
    )];

    await Promise.allSettled(
      storagePaths.map((storagePath) => deleteObject(ref(storage, storagePath)))
    );
  }

  function openAttachmentPicker(eventId = null, sectionId = null, subEventId = null) {
    if (!ensureWorkspaceEditAccess("add files")) return;
    if (!getCurrentPlan().storageLimitBytes) {
      showUpgradePrompt("attachments");
      return;
    }

    attachingEventId = eventId;
    attachingSectionId = sectionId;
    attachingSubEventId = subEventId;
    attachmentInput?.click();
  }

  function resetForm({ deleteDrafts = true } = {}) {
    if (deleteDrafts) {
      deleteDraftAttachments();
    }

    editingId = null;
    attachingEventId = null;
    attachingSectionId = null;
    attachingSubEventId = null;
    selectedAttachments = [];
    selectedSections = [];
    selectedCustomFields = [];
    selectedVisibleToEmails = resolveWorkspaceVisibilitySettings().visibleToEmails;
    title.value = "";
    summary.value = "";
    notes.value = "";
    startDate.value = "";
    endDate.value = "";
    reminderDate.value = "";
    locationInput.value = "";
    amountInput.value = "";
    peopleInput.value = "";
    tagsInput.value = "";
    externalLinkInput.value = "";
    statusSelectInput.value = "planned";
    addBtn.textContent = "Add Event";
    setSelectedColor("#5ea0ff");
    renderFolderControls();
    folderSelect.value = defaultFolders[0].value;
    renderAttachmentPreview();
    renderCustomFieldEditor();
    renderVisibilityControls();
    applyWorkspaceAccessState();
  }

  function loadEventIntoForm(eventItem) {
    if (!ensureWorkspaceEditAccess("edit shared milestones")) return;
    deleteDraftAttachments();
    editingId = eventItem.id;
    title.value = eventItem.title;
    summary.value = eventItem.summary;
    notes.value = eventItem.notes;
    startDate.value = eventItem.startDate;
    endDate.value = eventItem.endDate;
    reminderDate.value = eventItem.reminderDate;
    locationInput.value = eventItem.location;
    amountInput.value = eventItem.amount ?? "";
    peopleInput.value = eventItem.people.join(", ");
    tagsInput.value = eventItem.tags.join(", ");
    externalLinkInput.value = eventItem.externalLink;
    renderFolderControls();
    folderSelect.value = eventItem.folder || "general";
    statusSelectInput.value = eventItem.status || "planned";
    selectedAttachments = [...eventItem.attachments];
    selectedSections = eventItem.sections.map((section) => ({
      ...section,
      attachments: [...section.attachments],
      items: (section.items || []).map((item) => ({
        ...item,
        attachments: [...(item.attachments || [])]
      }))
    }));
    selectedCustomFields = eventItem.customFields.map((field) => ({ ...field }));
    selectedVisibleToEmails = resolveWorkspaceVisibilitySettings(eventItem).visibleToEmails;
    setSelectedColor(eventItem.color);
    addBtn.textContent = "Save Changes";
    renderAttachmentPreview();
    renderCustomFieldEditor();
    renderVisibilityControls(eventItem);
    applyWorkspaceAccessState();
    showSection(timelineView, timelineTab);
    title.focus();
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getSafeUrl(value) {
    if (!value) return "";

    try {
      const parsed = new URL(String(value), window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      return "";
    }

    return "";
  }

  function formatDate(value) {
    if (!value) return "No date yet";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatCurrency(value) {
    if (value === null || value === undefined || value === "") return "";

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(Number(value));
    } catch {
      return `$${Number(value)}`;
    }
  }

  function renderAttachmentPreview() {
    if (!attachmentPreview) return;

    if (!selectedAttachments.length) {
      attachmentPreview.innerHTML = '<span class="attachmentHint">No files attached to this milestone yet.</span>';
      return;
    }

    const previewImages = renderImagePreview(selectedAttachments);
    attachmentPreview.innerHTML = `
      <span class="attachmentLabel">Attached files:</span>
      ${previewImages}
      <div class="attachmentList">${selectedAttachments
        .map((attachment, index) => {
          const safeUrl = attachment.viewable ? getSafeUrl(attachment.url) : "";
          const availability = attachment.unresolved
            ? '<span class="attachmentMeta">Needs re-attach to preview</span>'
            : "";
          const viewLink = safeUrl
            ? `<a class="attachmentLink attachmentInlineAction" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">View</a>`
            : "";
          return `
            <span class="attachmentItem attachmentEditorItem">
              <span>${escapeHtml(attachment.name)}</span>
              ${availability}
              <span class="attachmentEditorActions">
                ${viewLink}
                <button class="attachmentRemoveBtn" type="button" data-remove-attachment="${index}">Remove</button>
              </span>
            </span>
          `;
        })
        .join("")}</div>
    `;

    attachmentPreview.querySelectorAll("[data-remove-attachment]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.removeAttachment);
        removeSelectedAttachment(index);
      });
    });
  }

  function removeSelectedAttachment(index) {
    const attachment = selectedAttachments[index];
    if (!attachment) return;

    if (attachment.storagePath) {
      void deleteStoredAttachments([attachment]);
    }

    selectedAttachments = selectedAttachments.filter((_, attachmentIndex) => attachmentIndex !== index);
    renderAttachmentPreview();
    setStatus(`Removed ${attachment.name}. Save changes to update the event.`, "success");
  }

  function renderAttachmentMarkup(attachments) {
    if (!attachments?.length) return "";

    const imageStrip = renderImagePreview(attachments);
    return `
      <div class="eventAttachments">
        ${imageStrip}
        <span class="attachmentLabel">Files</span>
        <div class="attachmentList">${attachments
          .map((attachment) => {
            const safeName = escapeHtml(attachment.name);
            const safeUrl = attachment.viewable ? getSafeUrl(attachment.url) : "";
            const unresolvedTag = attachment.unresolved
              ? '<span class="attachmentMeta">Needs re-attach</span>'
              : "";
            return safeUrl
              ? `<a class="attachmentItem attachmentLink attachmentChipLink" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${safeName}</a>`
              : `<span class="attachmentItem">${safeName}${unresolvedTag}</span>`;
          })
          .join("")}</div>
      </div>
    `;
  }

  function renderImagePreview(attachments) {
    const images = attachments
      .map((attachment) => ({ ...attachment, safeUrl: getSafeUrl(attachment.url) }))
      .filter((attachment) => attachment.isImage && attachment.safeUrl)
      .slice(0, 3);

    if (!images.length) return "";

    return `
      <div class="imageStrip">
        ${images
          .map((image) => `
            <a class="thumbImageLink" href="${escapeHtml(image.safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(image.name)}">
              <img class="thumbImage" src="${escapeHtml(image.safeUrl)}" alt="${escapeHtml(image.name)}">
            </a>
          `)
          .join("")}
      </div>
    `;
  }

  function renderExternalLink(url) {
    const safeUrl = getSafeUrl(url);

    if (!safeUrl) return "";

    return `<a class="externalLink" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Open reference link</a>`;
  }

  function buildSectionSummaryText(eventItem) {
    const sections = eventItem?.sections || [];
    if (!sections.length) return "";

    const sectionLines = sections.slice(0, 3).map((section) => {
      const miniCount = section.items.length;
      const fileCount = getSectionAttachmentList(section).length;
      const highlights = section.items.slice(0, 2).map((item) => item.title).filter(Boolean);
      const counts = [];

      if (miniCount) counts.push(`${miniCount} mini event${miniCount === 1 ? "" : "s"}`);
      if (fileCount) counts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);

      let sectionLine = `${section.title}: ${counts.length ? counts.join(", ") : "no mini events or files yet"}`;
      if (highlights.length) {
        sectionLine += ` (${highlights.join(", ")}${miniCount > highlights.length ? ", ..." : ""})`;
      }
      return sectionLine;
    });

    const hiddenSectionCount = sections.length - sectionLines.length;
    if (hiddenSectionCount > 0) {
      sectionLines.push(`${hiddenSectionCount} more subfolder${hiddenSectionCount === 1 ? "" : "s"}`);
    }

    return `${sectionLines.join(". ")}.`;
  }

  function renderSectionSummaryBlock(eventItem) {
    if (!eventItem?.showSectionSummary || !eventItem.sections?.length) return "";

    return `
      <div class="sectionSummaryBlock">
        <span class="attachmentLabel">Subfolder Summary</span>
        <p>${escapeHtml(buildSectionSummaryText(eventItem))}</p>
      </div>
    `;
  }

  function renderSectionsMarkup(eventItem) {
    const sections = eventItem?.sections || [];
    if (!sections.length) return "";

    return `
      <div class="eventSections">
        ${renderSectionSummaryBlock(eventItem)}
        <span class="attachmentLabel">Subfolders</span>
        <div class="sectionDetailsList">
          ${sections
            .map((section) => `
              <details class="sectionDetails">
                <summary>
                  <span>${escapeHtml(section.title)}</span>
                  <strong>${section.items.length} mini event${section.items.length === 1 ? "" : "s"} | ${getSectionAttachmentList(section).length} file${getSectionAttachmentList(section).length === 1 ? "" : "s"}</strong>
                </summary>
                ${section.notes ? `<p>${escapeHtml(section.notes)}</p>` : ""}
                ${renderAttachmentMarkup(section.attachments)}
                ${section.items?.length
                  ? `
                    <div class="sectionDetailsList">
                      ${section.items
                        .map((item) => `
                          <div class="subEventCard">
                            <div class="subEventCardTop">
                              <strong>${escapeHtml(item.title)}</strong>
                              <span class="statusBadge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                            </div>
                            ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                            <small>${escapeHtml(item.date ? formatDate(item.date) : "No date yet")}</small>
                            ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
                            ${renderAttachmentMarkup(item.attachments)}
                          </div>
                        `)
                        .join("")}
                    </div>
                  `
                  : ""}
              </details>
            `)
            .join("")}
        </div>
      </div>
    `;
  }

  function toggleEventWorkspace(eventId) {
    const nextEventId = activeDrawerEventId === eventId ? null : eventId;
    if (nextEventId !== activeDrawerEventId) {
      drawerSectionDrafts = {};
    }
    activeDrawerEventId = nextEventId;
    render();
  }

  function renderWorkspaceMiniEventForm(section, canEditWorkspace = canCurrentUserEditWorkspace()) {
    if (!canEditWorkspace) return "";
    const draft = getSectionDraft(section.id);
    return `
      <div class="subEventComposer" data-section-form="${escapeHtml(section.id)}">
        <div class="subEventGrid">
          <input class="subEventTitleInput" type="text" placeholder="Mini event title" value="${escapeHtml(draft.title)}">
          <input class="subEventDateInput" type="date" value="${escapeHtml(draft.date)}">
        </div>
        <input class="subEventSummaryInput" type="text" placeholder="Short summary" value="${escapeHtml(draft.summary)}">
        <select class="subEventStatusInput">
          <option value="planned" ${draft.status === "planned" ? "selected" : ""}>Planned</option>
          <option value="active" ${draft.status === "active" ? "selected" : ""}>Active</option>
          <option value="done" ${draft.status === "done" ? "selected" : ""}>Done</option>
          <option value="archived" ${draft.status === "archived" ? "selected" : ""}>Archived</option>
        </select>
        <textarea class="subEventNotesInput" rows="3" placeholder="Notes for this mini event...">${escapeHtml(draft.notes)}</textarea>
        <div class="subEventActions">
          <button class="secondaryBtn saveSubEventBtn" type="button">${draft.editingItemId ? "Save Mini Event" : "Add Mini Event"}</button>
          ${draft.editingItemId ? '<button class="secondaryBtn cancelSubEventBtn" type="button">Cancel Edit</button>' : ""}
        </div>
      </div>
    `;
  }

  function renderInlineWorkspace(eventItem) {
    const canEditWorkspace = canCurrentUserEditWorkspace();
    const sectionSummaryPreview = buildSectionSummaryText(eventItem);
    return `
      <section class="eventWorkspace" data-workspace-event="${escapeHtml(eventItem.id)}">
        <div class="workspaceHeader">
          <div>
            <p class="eyebrow">Subfolders + Mini Events</p>
            <h4>${escapeHtml(eventItem.title)}</h4>
            <p class="workspaceCopy">${canEditWorkspace ? "Create subfolders inside this event, then track smaller mini events and files under each one." : "Browse the subfolders, mini events, and files the owner has shared with you. Ask them if you need edit access."}</p>
          </div>
          <button class="secondaryBtn closeWorkspaceBtn" type="button">Hide</button>
        </div>
        ${canEditWorkspace ? `
          <label class="workspaceSummaryToggle">
            <input class="workspaceSummaryToggleInput" type="checkbox" ${eventItem.showSectionSummary ? "checked" : ""}>
            <div>
              <strong>Show a summary of these subfolders on the main event</strong>
              <p>Give the event card a quick recap of the subfolders, mini events, and files underneath.</p>
            </div>
          </label>
        ` : ""}
        ${eventItem.showSectionSummary && sectionSummaryPreview
          ? `<p class="workspaceSummaryPreview">${escapeHtml(sectionSummaryPreview)}</p>`
          : ""}
        ${canEditWorkspace ? `
          <div class="workspaceAddRow">
            <input class="workspaceSectionInput" type="text" placeholder="Add a subfolder like Oil Changes, Lease Docs, or Clients">
            <button class="secondaryBtn addWorkspaceSectionBtn" type="button">Add Subfolder</button>
          </div>
        ` : ""}
        <div class="workspaceFolderList">
          ${eventItem.sections.length
            ? eventItem.sections.map((section) => `
              <details class="workspaceFolder" data-workspace-section="${escapeHtml(section.id)}" ${getSectionDraft(section.id).editingItemId ? "open" : ""}>
                <summary class="workspaceFolderSummary">
                  <span>${escapeHtml(section.title)}</span>
                  <strong>${section.items.length} mini event${section.items.length === 1 ? "" : "s"} | ${getSectionAttachmentList(section).length} file${getSectionAttachmentList(section).length === 1 ? "" : "s"}</strong>
                </summary>
                <div class="workspaceFolderBody">
                  <label class="fieldGroup">
                    <span>Subfolder Name</span>
                    <input class="workspaceSectionTitleInput" type="text" value="${escapeHtml(section.title)}" placeholder="Subfolder name" ${canEditWorkspace ? "" : "disabled"}>
                  </label>
                  ${renderAttachmentMarkup(section.attachments)}
                  ${canEditWorkspace ? `
                    <div class="sectionActions">
                      <button class="secondaryBtn attachWorkspaceSectionBtn" type="button">Attach Files to Subfolder</button>
                      <button class="secondaryBtn removeWorkspaceSectionBtn" type="button">Remove Subfolder</button>
                    </div>
                  ` : ""}
                  ${renderWorkspaceMiniEventForm(section, canEditWorkspace)}
                  <div class="workspaceMiniList">
                    ${section.items.length
                      ? section.items.map((item) => `
                        <article class="subEventCard" data-sub-event-id="${escapeHtml(item.id)}">
                          <div class="subEventCardTop">
                            <strong>${escapeHtml(item.title)}</strong>
                            <span class="statusBadge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                          </div>
                          ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                          <small>${escapeHtml(item.date ? formatDate(item.date) : "No date yet")}</small>
                          ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
                          ${renderAttachmentMarkup(item.attachments)}
                          ${canEditWorkspace ? `
                            <div class="subEventActions">
                              <button class="secondaryBtn editSubEventBtn" type="button">Edit</button>
                              <button class="secondaryBtn attachSubEventBtn" type="button">Attach Files</button>
                              <button class="secondaryBtn deleteSubEventBtn" type="button">Delete</button>
                            </div>
                          ` : ""}
                        </article>
                      `).join("")
                      : '<div class="emptyState">No mini events in this subfolder yet.</div>'}
                  </div>
                </div>
              </details>
            `).join("")
            : '<div class="emptyState">No subfolders yet. Add one to organize smaller work under this event.</div>'}
        </div>
      </section>
    `;
  }

  function bindWorkspaceInteractions(card, eventItem) {
    const workspace = card.querySelector("[data-workspace-event]");
    if (!workspace) return;
    const canEditWorkspace = canCurrentUserEditWorkspace();

    const sectionInput = workspace.querySelector(".workspaceSectionInput");
    const addSection = async () => {
      const titleValue = String(sectionInput.value || "").trim();
      if (!titleValue) {
        setStatus("Type a subfolder name first.", "error");
        return;
      }

      const nextSections = [
        ...eventItem.sections,
        {
          id: generateSectionId(),
          title: titleValue,
          notes: "",
          attachments: [],
          items: []
        }
      ];

      await saveEventSections(eventItem.id, nextSections, `Subfolder "${titleValue}" added.`);
      sectionInput.value = "";
    };

    workspace.querySelector(".closeWorkspaceBtn").onclick = () => {
      closeEventDrawer();
      render();
    };
    workspace.querySelector(".workspaceSummaryToggleInput")?.addEventListener("change", async (event) => {
      await updateDoc(
        doc(db, "events", eventItem.id),
        buildEventDocumentPayload(eventItem, {
          showSectionSummary: event.target.checked,
          updatedAt: Date.now()
        })
      );
      setStatus(event.target.checked ? "Subfolder summary will show on this event." : "Subfolder summary hidden for this event.", "success");
    });
    if (!canEditWorkspace) return;

    workspace.querySelector(".addWorkspaceSectionBtn").onclick = addSection;
    sectionInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void addSection();
    });

    workspace.querySelectorAll("[data-workspace-section]").forEach((sectionNode) => {
      const sectionId = sectionNode.dataset.workspaceSection;
      const draft = getSectionDraft(sectionId);
      sectionNode.querySelector(".workspaceSectionTitleInput").addEventListener("change", (event) => {
        void renameDrawerSection(sectionId, event.target.value);
      });
      sectionNode.querySelector(".attachWorkspaceSectionBtn")?.addEventListener("click", () => openAttachmentPicker(eventItem.id, sectionId, null));
      sectionNode.querySelector(".removeWorkspaceSectionBtn")?.addEventListener("click", () => removeDrawerSection(sectionId));
      sectionNode.querySelector(".subEventTitleInput")?.addEventListener("input", (event) => {
        draft.title = event.target.value;
      });
      sectionNode.querySelector(".subEventSummaryInput")?.addEventListener("input", (event) => {
        draft.summary = event.target.value;
      });
      sectionNode.querySelector(".subEventDateInput")?.addEventListener("input", (event) => {
        draft.date = event.target.value;
      });
      sectionNode.querySelector(".subEventStatusInput")?.addEventListener("change", (event) => {
        draft.status = event.target.value;
      });
      sectionNode.querySelector(".subEventNotesInput")?.addEventListener("input", (event) => {
        draft.notes = event.target.value;
      });
      sectionNode.querySelector(".saveSubEventBtn")?.addEventListener("click", () => saveDrawerSubEvent(sectionId));
      sectionNode.querySelector(".cancelSubEventBtn")?.addEventListener("click", () => {
        populateSectionDraft(sectionId, null);
        render();
      });

      sectionNode.querySelectorAll("[data-sub-event-id]").forEach((itemCard) => {
        const itemId = itemCard.dataset.subEventId;
        itemCard.querySelector(".editSubEventBtn")?.addEventListener("click", () => startDrawerSubEventEdit(sectionId, itemId));
        itemCard.querySelector(".attachSubEventBtn")?.addEventListener("click", () => openAttachmentPicker(eventItem.id, sectionId, itemId));
        itemCard.querySelector(".deleteSubEventBtn")?.addEventListener("click", () => deleteDrawerSubEvent(sectionId, itemId));
      });
    });
  }

  async function moveToTrash(eventItem) {
    if (!ensureWorkspaceEditAccess("move items to trash")) return;
    const { id: eventId, ...data } = eventItem;
    const trashRef = doc(collection(db, "trash"));
    const batch = writeBatch(db);
    batch.set(trashRef, buildTrashDocumentPayload(data, { originalEventId: eventId }));
    batch.delete(doc(db, "events", eventId));
    await batch.commit();
    setStatus(`Moved "${eventItem.title}" to trash.`, "success");

    if (editingId === eventId) {
      resetForm();
    }
  }

  async function restore(trashItem) {
    if (!ensureWorkspaceEditAccess("restore trashed items")) return;
    const { trashId, originalEventId, ...data } = trashItem;
    const eventRef = doc(collection(db, "events"));
    const batch = writeBatch(db);
    batch.set(
      eventRef,
      buildEventDocumentPayload(data, {
        restoreSourceId: trashId,
        order: getNextOrder(),
        updatedAt: Date.now()
      })
    );
    batch.delete(doc(db, "trash", trashId));
    await batch.commit();
    await updateDoc(eventRef, {
      restoreSourceId: deleteField(),
      updatedAt: Date.now()
    });
    setStatus(`Restored "${trashItem.title}".`, "success");
  }

  async function deleteForever(trashItem) {
    if (!ensureWorkspaceEditAccess("delete shared items forever")) return;
    const confirmed = window.confirm(
      `Delete "${trashItem.title}" forever? Attached files will also be removed.`
    );

    if (!confirmed) return;

    await deleteStoredAttachments([
      ...trashItem.attachments,
      ...trashItem.sections.flatMap((section) => getSectionAttachmentList(section))
    ]);
    await deleteDoc(doc(db, "trash", trashItem.trashId));
    setStatus("Deleted permanently.", "success");
  }

  document.addEventListener("click", (event) => {
    const menuButton = event.target.closest(".menuBtn");

    document.querySelectorAll(".dropdown").forEach((dropdown) => {
      dropdown.style.display = "none";
      dropdown.closest(".eventCard")?.classList.remove("menuOpen");
    });

    if (!menuButton) return;

    const dropdown = menuButton.nextElementSibling;
    if (dropdown) {
      const isOpen = dropdown.style.display === "block";
      dropdown.style.display = isOpen ? "none" : "block";
      menuButton.closest(".eventCard")?.classList.toggle("menuOpen", !isOpen);
    }
  });

  function render() {
    const visibleEvents = getVisibleEvents();
    renderDashboard(visibleEvents);

    if (activeSection === "timeline") {
      renderTimeline(visibleEvents);
    }

    if (activeSection === "views") {
      if (activeViewGraph === "table") renderTable(visibleEvents);
      if (activeViewGraph === "vertical") renderVerticalTimeline(visibleEvents);
      if (activeViewGraph === "spotlight") renderSpotlightGraph(visibleEvents);
    }

    if (activeSection === "story") {
      renderStoryStudio(visibleEvents);
    }

    applyWorkspaceAccessState();
  }

  function renderDashboard(visibleEvents) {
    const stats = buildDashboardStats(visibleEvents);
    const attachmentHealthMetric = buildAttachmentHealthMetric(stats.attachmentHealth);

    dashboardHeadline.textContent = stats.headline;
    dashboardSubcopy.textContent = stats.subcopy;
    renderPlanSurfaces();

    metricsGrid.innerHTML = [
      metricCard("Visible Events", stats.visibleCount, "Matched by your current filters and folder focus."),
      metricCard("Life Chapters", stats.totalCount, "Everything currently saved in your account."),
      metricCard("Completion Rate", `${stats.doneRate}%`, "Share of milestones marked done."),
      metricCard("Attachment Vault", stats.attachmentCount, "Files, photos, and supporting receipts tied to events."),
      metricCard("Attachment Health", attachmentHealthMetric.value, attachmentHealthMetric.description),
      metricCard("Streak", `${stats.streakDays} days`, "Consecutive days with timeline activity."),
      metricCard("Upcoming", stats.upcomingCount, "Reminders or future-dated milestones waiting ahead.")
    ].join("");

    insightCards.innerHTML = buildInsights(visibleEvents)
      .map(
        (insight) => `
          <article class="insightCard">
            <p class="insightLabel">${escapeHtml(insight.label)}</p>
            <h4>${escapeHtml(insight.value)}</h4>
            <p>${escapeHtml(insight.description)}</p>
          </article>
        `
      )
      .join("");

    const prompts = buildPrompts(visibleEvents);
    dashboardPrompts.innerHTML = renderPromptCards(prompts, "dashboard");
    sidebarPrompts.innerHTML = renderPromptCards(prompts.slice(0, 2), "sidebar");

    upcomingList.innerHTML = renderMiniEventList(stats.upcomingEvents, "No upcoming reminders or future chapters yet.");
    recentList.innerHTML = renderMiniEventList(stats.recentEvents, "Your newest milestones will show up here.");

    folderOverview.innerHTML = stats.folderCounts.length
      ? stats.folderCounts
          .map(
            (folder) => `
              <button class="folderPulse" type="button" data-folder="${escapeHtml(folder.value)}">
                <span>${escapeHtml(folder.label)}</span>
                <strong>${folder.count}</strong>
              </button>
            `
          )
          .join("")
      : '<div class="emptyState">Add a few milestones and your folder pulse will appear here.</div>';

    folderOverview.querySelectorAll(".folderPulse").forEach((button) => {
      button.onclick = () => {
        activeFolder = button.dataset.folder;
        renderFolderControls();
        render();
      };
    });

    renderAttachmentHealthPanel(stats.attachmentHealth);
    applyDashboardPreferences();
  }

  function metricCard(label, value, description) {
    return `
      <article class="metricCard">
        <p>${escapeHtml(label)}</p>
        <h3>${escapeHtml(String(value))}</h3>
        <span>${escapeHtml(description)}</span>
      </article>
    `;
  }

  function renderPlanSurfaces() {
    const currentPlanKey = getCurrentPlanKey();
    const currentPlan = getCurrentPlan();
    const storageUsedBytes = getStorageUsedBytes();
    const storageLimit = currentPlan.storageLimitBytes;
    const storageLabel = storageLimit
      ? `${formatBytes(storageUsedBytes)} / ${formatBytes(storageLimit)}`
      : "Attachments locked";
    const shareLimit = Number(currentPlan.shareLimit || 0);
    const sharingLabel = shareLimit
      ? `${getWorkspaceAuthorizedUsers().length} / ${shareLimit}`
      : "Not included";
    const creatorBillingNote = userProfile.creatorAccess
      ? '<p class="planHint">This creator account was upgraded manually, so Stripe billing tools do not apply here.</p>'
      : "";
    const paymentAttentionNote = userProfile.stripeSubscriptionStatus === "past_due"
      ? '<p class="planHint">A payment issue was detected. Open billing to keep your paid features active.</p>'
      : "";
    const unpaidBillingNote = canCurrentUserManageWorkspace() && !userProfile.creatorAccess && currentPlanKey !== "free" && !userProfile.stripeCustomerId
      ? '<p class="planHint">This account does not currently have a Stripe billing link attached.</p>'
      : "";
    const sharedWorkspaceNote = !canCurrentUserManageWorkspace() && getWorkspaceOwnerUid() && getWorkspaceOwnerUid() !== user?.uid
      ? `<p class="planHint">This account is sharing paid access through ${escapeHtml(getWorkspaceOwnerEmail() || "the purchasing user")}.</p>`
      : "";
    const ownerManagedBillingNote = !canCurrentUserManageWorkspace() && currentPlanKey !== "free"
      ? '<p class="planHint">Billing is controlled by the purchasing user for this shared account.</p>'
      : "";

    planStatus.innerHTML = `
      <p class="eyebrow">Current Plan</p>
      <h3>${escapeHtml(currentPlan.label)}</h3>
      <div class="usageLine"><span>Milestones</span><strong>${events.length} / ${currentPlan.eventLimit}</strong></div>
      <div class="usageLine"><span>Folders</span><strong>${getCustomFolderCount()} / ${currentPlan.folderLimit}</strong></div>
      <div class="usageLine"><span>Authorized users</span><strong>${escapeHtml(String(sharingLabel))}</strong></div>
      <div class="usageLine"><span>Storage</span><strong>${escapeHtml(storageLabel)}</strong></div>
      ${creatorBillingNote}
      ${paymentAttentionNote}
      ${unpaidBillingNote}
      ${sharedWorkspaceNote}
      ${ownerManagedBillingNote}
    `;

    const planPanelTarget = currentPlanKey === "free" ? upgradePanel : settingsPlanPanel;
    const inactivePlanPanel = currentPlanKey === "free" ? settingsPlanPanel : upgradePanel;
    const canSelfManageBilling = canCurrentUserManageWorkspace() && Boolean(userProfile.stripeCustomerId);
    const planPanelActions = canSelfManageBilling
      ? '<button id="manageBillingPlanBtn" type="button" class="secondaryBtn">Manage Billing</button>'
      : "";

    inactivePlanPanel.hidden = true;
    inactivePlanPanel.innerHTML = "";
    planPanelTarget.hidden = false;
    planPanelTarget.innerHTML = `
      <div class="panelHeader">
        <div>
          <h3>${currentPlanKey === "free" ? "Choose Your Chronicle Canvas Plan" : "Manage Your Chronicle Canvas Plan"}</h3>
          <p>${currentPlanKey === "free"
            ? "Start free, then upgrade when the archive becomes real for you."
            : "Review your current plan, compare options, or change your subscription from Settings."}</p>
          <p class="planHint">Home can share with 1 authorized user. Advanced can share with up to 3 while you keep event-level visibility control.</p>
          ${userProfile.creatorAccess ? '<p class="planHint">Creator access accounts are managed manually and will not show the Stripe billing portal.</p>' : ""}
        </div>
        ${planPanelActions}
      </div>
      <div class="pricingGrid">
        ${Object.entries(planLimits)
          .map(([planKey, plan]) => renderPlanCard(
            planKey,
            plan,
            currentPlanKey,
            currentPlanKey !== "free" && canSelfManageBilling,
            !canCurrentUserManageWorkspace()
          ))
          .join("")}
      </div>
    `;

    const manageBillingPlanBtn = document.getElementById("manageBillingPlanBtn");
    if (manageBillingPlanBtn) {
      manageBillingPlanBtn.onclick = () => startBillingPortal(manageBillingPlanBtn);
    }

    planPanelTarget.querySelectorAll("[data-upgrade-plan]").forEach((button) => {
      button.onclick = () => startCheckout(button.dataset.upgradePlan, button);
    });
  }

  function renderPlanCard(planKey, plan, currentPlanKey, manageInBilling = false, ownerManaged = false) {
    const isCurrent = planKey === currentPlanKey;
    const isComingSoon = Boolean(plan.comingSoon);
    const callToAction = isCurrent
      ? "Current Plan"
      : planKey === "free"
        ? "Always Free"
        : isComingSoon
          ? "Coming Soon"
        : ownerManaged
          ? "Owner Managed"
        : manageInBilling
          ? "Change in Billing"
          : `Upgrade to ${plan.label}`;

    return `
      <article class="planCard${isCurrent ? " current" : ""}${isComingSoon ? " comingSoon" : ""}">
        <div>
          <p class="eyebrow">${escapeHtml(plan.label)}</p>
          <h4>${escapeHtml(plan.price)}</h4>
          <p>${escapeHtml(plan.description)}</p>
          ${plan.noteLabel ? `
            <div class="planNote">
              <span>${escapeHtml(plan.noteLabel)}</span>
              <button
                type="button"
                class="infoBubble"
                aria-label="${escapeHtml(plan.noteHint || plan.noteLabel)}"
                title="${escapeHtml(plan.noteHint || plan.noteLabel)}"
              >i</button>
            </div>
          ` : ""}
        </div>
        <ul>
          ${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
        </ul>
        <button class="${isCurrent || isComingSoon || ownerManaged ? "secondaryBtn" : ""}" type="button" data-upgrade-plan="${escapeHtml(planKey)}" ${isCurrent || planKey === "free" || isComingSoon || ownerManaged ? "disabled" : ""}>
          ${escapeHtml(callToAction)}
        </button>
      </article>
    `;
  }

  async function startCheckout(planKey, button) {
    if (!planLimits[planKey] || planKey === "free" || planLimits[planKey].comingSoon) return;

    if (getCurrentPlanKey() !== "free" && userProfile.stripeCustomerId) {
      await startBillingPortal(button);
      return;
    }

    await withBusy(button, "Opening Checkout...", async () => {
      await ensureAppCheckReady();
      const createCheckoutSession = httpsCallable(functions, "createCheckoutSession");
      const result = await createCheckoutSession({
        idToken: await getFreshIdToken(),
        plan: planKey,
        origin: window.location.origin + window.location.pathname
      });
      const url = result.data?.url;

      if (!url) {
        throw new Error("Checkout is not configured yet. Add Stripe price IDs in Firebase Functions config.");
      }

      window.location.assign(url);
    });
  }

  async function startBillingPortal(button) {
    await withBusy(button, "Opening Portal...", async () => {
      await ensureAppCheckReady();
      const createBillingPortalSession = httpsCallable(functions, "createBillingPortalSession");
      const result = await createBillingPortalSession({
        idToken: await getFreshIdToken(),
        returnUrl: window.location.origin + window.location.pathname
      });
      const url = result.data?.url;

      if (!url) {
        throw new Error("Billing portal is not configured yet.");
      }

      window.location.assign(url);
    });
  }

  async function warmAppCheck() {
    try {
      await ensureAppCheckReady();
    } catch (error) {
      console.warn("App Check warmup failed", error);
    }
  }

  async function ensureAppCheckReady() {
    if (!appCheck) {
      return null;
    }

    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await getAppCheckToken(appCheck, attempt === 2);
        if (result?.token) {
          return result.token;
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    console.error("App Check token could not be acquired", lastError);
    throw new Error(
      "App integrity could not be verified on this device yet. Open Chronicle Canvas in Safari, disable any content blockers for this page, then try again."
    );
  }

  function buildDashboardStats(visibleEvents) {
    const today = getTodayKey();
    const totalCount = events.length;
    const visibleCount = visibleEvents.length;
    const doneCount = events.filter((event) => event.status === "done").length;
    const attachmentCount = events.reduce((sum, event) => {
      const sectionAttachmentCount = event.sections.reduce(
        (sectionSum, section) => sectionSum + getSectionAttachmentList(section).length,
        0
      );
      return sum + event.attachments.length + sectionAttachmentCount;
    }, 0);
    const streakDays = calculateStreakDays(events);
    const upcomingEvents = [...events]
      .filter((event) => {
        const date = event.reminderDate || event.startDate;
        return date && date >= today;
      })
      .sort((left, right) => (left.reminderDate || left.startDate).localeCompare(right.reminderDate || right.startDate))
      .slice(0, 4);
    const recentEvents = [...events]
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
      .slice(0, 4);
    const folderCounts = getAllFolderValues()
      .map((folderValue) => ({
        value: folderValue,
        label: formatFolderLabel(folderValue),
        count: events.filter((event) => event.folder === folderValue).length
      }))
      .filter((folder) => folder.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);

    const headline = visibleCount
      ? `You have ${visibleCount} chapter${visibleCount === 1 ? "" : "s"} in focus right now.`
      : "Your story has room for a bold new chapter.";
    const subcopy = visibleCount
      ? "Every milestone you add compounds into a sharper, richer picture of your life."
      : "Start with one meaningful moment and this dashboard will turn it into momentum, prompts, and insight.";
    const attachmentHealth = buildAttachmentHealthSummary();

    return {
      totalCount,
      visibleCount,
      doneRate: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
      attachmentCount,
      streakDays,
      upcomingCount: upcomingEvents.length,
      upcomingEvents,
      recentEvents,
      folderCounts,
      headline,
      subcopy,
      attachmentHealth
    };
  }

  function getAttachmentHealthState(attachment) {
    if (!attachment) return "unresolved";
    if (attachment.unresolved || (!attachment.url && !attachment.storagePath)) return "unresolved";
    if (!attachment.url && attachment.storagePath) return "recovering";
    return "healthy";
  }

  function buildAttachmentHealth(sourceItems = [], itemType = "event") {
    const records = sourceItems.flatMap((item) => {
      const itemTitle = item.title || "Untitled Event";
      const buildRecord = (attachment, scopeLabel) => ({
        itemId: item.id,
        itemTitle,
        itemType,
        scopeLabel,
        attachment,
        state: getAttachmentHealthState(attachment)
      });

      const mainAttachments = (item.attachments || []).map((attachment) =>
        buildRecord(attachment, "Main event")
      );
      const sectionAttachments = (item.sections || []).flatMap((section) => {
        const sectionTitle = section.title || "Untitled subfolder";
        const sectionLevel = (section.attachments || []).map((attachment) =>
          buildRecord(attachment, `Subfolder: ${sectionTitle}`)
        );
        const miniEventLevel = (section.items || []).flatMap((subItem) => {
          const subItemTitle = subItem.title || "Untitled mini event";
          return (subItem.attachments || []).map((attachment) =>
            buildRecord(attachment, `Mini event: ${subItemTitle} (${sectionTitle})`)
          );
        });

        return [...sectionLevel, ...miniEventLevel];
      });

      return [...mainAttachments, ...sectionAttachments];
    });

    const healthyCount = records.filter((record) => record.state === "healthy").length;
    const recoveringIssues = records.filter((record) => record.state === "recovering");
    const unresolvedIssues = records.filter((record) => record.state === "unresolved");

    return {
      total: records.length,
      healthyCount,
      recoveringCount: recoveringIssues.length,
      unresolvedCount: unresolvedIssues.length,
      issues: [...unresolvedIssues, ...recoveringIssues]
    };
  }

  function buildAttachmentHealthSummary() {
    const activeHealth = buildAttachmentHealth(events, "event");
    const trashHealth = buildAttachmentHealth(trash, "trash");
    const issues = [...activeHealth.issues, ...trashHealth.issues];

    return {
      total: activeHealth.total + trashHealth.total,
      healthyCount: activeHealth.healthyCount + trashHealth.healthyCount,
      recoveringCount: activeHealth.recoveringCount + trashHealth.recoveringCount,
      unresolvedCount: activeHealth.unresolvedCount + trashHealth.unresolvedCount,
      issueCount: issues.length,
      activeIssueCount: activeHealth.issues.length,
      trashIssueCount: trashHealth.issues.length,
      issues
    };
  }

  function buildAttachmentHealthMetric(attachmentHealth) {
    if (!attachmentHealth.total) {
      return {
        value: "No files",
        description: "No attachments are stored yet. Once you add files, this card will flag anything incomplete."
      };
    }

    if (attachmentHealth.unresolvedCount) {
      return {
        value: `${attachmentHealth.unresolvedCount} alert${attachmentHealth.unresolvedCount === 1 ? "" : "s"}`,
        description: "One or more file records need attention. Open Settings to review and re-attach if needed."
      };
    }

    if (attachmentHealth.recoveringCount) {
      return {
        value: `${attachmentHealth.recoveringCount} checking`,
        description: "Some attachments are still resolving their file links. They should settle in automatically."
      };
    }

    return {
      value: "All clear",
      description: `${attachmentHealth.total} attachment${attachmentHealth.total === 1 ? "" : "s"} currently look healthy across active events and trash.`
    };
  }

  function renderAttachmentHealthPanel(attachmentHealth) {
    if (!attachmentHealthPanel) return;

    if (!attachmentHealth.total) {
      attachmentHealthPanel.innerHTML = `
        <div class="attachmentHealthSummary healthy">
          <strong>No attachments are stored yet.</strong>
          <p>Once you add files, this panel will flag anything incomplete before it turns into a surprise later.</p>
        </div>
      `;
      return;
    }

    const summaryTone = attachmentHealth.unresolvedCount
      ? "warning"
      : attachmentHealth.recoveringCount
        ? "checking"
        : "healthy";
    const summaryTitle = attachmentHealth.unresolvedCount
      ? `${attachmentHealth.unresolvedCount} attachment record${attachmentHealth.unresolvedCount === 1 ? "" : "s"} need attention.`
      : attachmentHealth.recoveringCount
        ? `${attachmentHealth.recoveringCount} attachment record${attachmentHealth.recoveringCount === 1 ? " is" : "s are"} still resolving.`
        : "All attachment records look healthy.";
    const summaryCopy = attachmentHealth.unresolvedCount
      ? "These are usually older or incomplete file records. Open the event, remove the stale file chip, and re-attach it once."
      : attachmentHealth.recoveringCount
        ? "These records still have a storage path behind them, so the app is trying to reconnect the file URL cleanly."
        : "New uploads now have a much stronger recovery path, and everything visible here is currently linked up the way it should be.";
    const visibleIssues = attachmentHealth.issues.slice(0, 6);
    const remainingIssues = attachmentHealth.issueCount - visibleIssues.length;

    attachmentHealthPanel.innerHTML = `
      <div class="attachmentHealthSummary ${summaryTone}">
        <strong>${escapeHtml(summaryTitle)}</strong>
        <p>${escapeHtml(summaryCopy)}</p>
      </div>
      <div class="attachmentHealthCounts">
        <div><span>Total files</span><strong>${attachmentHealth.total}</strong></div>
        <div><span>Healthy</span><strong>${attachmentHealth.healthyCount}</strong></div>
        <div><span>Recovering</span><strong>${attachmentHealth.recoveringCount}</strong></div>
        <div><span>Needs attention</span><strong>${attachmentHealth.unresolvedCount}</strong></div>
      </div>
      ${visibleIssues.length ? `
        <div class="attachmentHealthIssueList">
          ${visibleIssues
            .map((issue) => {
              const actionMarkup = issue.itemType === "event"
                ? `<button class="secondaryBtn attachmentHealthAction" type="button" data-open-event="${escapeHtml(issue.itemId)}">Open Event</button>`
                : `<button class="secondaryBtn attachmentHealthAction" type="button" data-open-trash="true">Open Trash</button>`;

              return `
                <article class="attachmentHealthIssue">
                  <div>
                    <div class="attachmentHealthMeta">
                      <span class="attachmentHealthTag ${issue.state}">${issue.state === "unresolved" ? "Needs re-attach" : "Recovering URL"}</span>
                      <span class="attachmentHealthTag">${escapeHtml(issue.itemType === "trash" ? "In Trash" : "Active Event")}</span>
                    </div>
                    <h4>${escapeHtml(issue.attachment.name || "Untitled file")}</h4>
                    <p>${escapeHtml(`${issue.scopeLabel} - ${issue.itemTitle}`)}</p>
                  </div>
                  ${actionMarkup}
                </article>
              `;
            })
            .join("")}
        </div>
      ` : `
        <div class="emptyState">Nothing needs follow-up right now.</div>
      `}
      ${remainingIssues > 0 ? `<p class="attachmentHealthMore">+ ${remainingIssues} more issue${remainingIssues === 1 ? "" : "s"} listed beyond this preview.</p>` : ""}
    `;
  }

  function calculateStreakDays(sourceEvents) {
    const dayKeys = [...new Set(sourceEvents.map((event) => toDayKey(event.updatedAt || event.createdAt)))].sort();
    if (!dayKeys.length) return 0;

    let streak = 1;
    for (let i = dayKeys.length - 1; i > 0; i -= 1) {
      const current = new Date(`${dayKeys[i]}T00:00:00`);
      const previous = new Date(`${dayKeys[i - 1]}T00:00:00`);
      const difference = Math.round((current - previous) / 86400000);
      if (difference === 1) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }

  function toDayKey(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return date.toISOString().slice(0, 10);
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function buildInsights(visibleEvents) {
    if (!visibleEvents.length) {
      return [
        { label: "Next move", value: "Add your first milestone", description: "Once the first event lands, this area starts surfacing patterns and standout moments." },
        { label: "Story mode", value: "Waiting for chapters", description: "The more color and detail you add, the more cinematic the story studio becomes." },
        { label: "Momentum", value: "Zero friction start", description: "Begin with one date, one title, and one sentence. Depth can come later." }
      ];
    }

    const busiestFolder = [...visibleEvents].reduce((best, event) => {
      best[event.folder] = (best[event.folder] || 0) + 1;
      return best;
    }, {});

    const topFolder = Object.entries(busiestFolder).sort((left, right) => right[1] - left[1])[0];
    const highestValue = [...visibleEvents].filter((event) => event.amount).sort((left, right) => (right.amount || 0) - (left.amount || 0))[0];
    const reminderCount = visibleEvents.filter((event) => event.reminderDate).length;
    const imageRichCount = visibleEvents.filter((event) => {
      const mainImages = event.attachments.some((attachment) => attachment.isImage);
      const sectionImages = event.sections.some((section) =>
        getSectionAttachmentList(section).some((attachment) => attachment.isImage)
      );
      return mainImages || sectionImages;
    }).length;

    return [
      {
        label: "Busiest area",
        value: topFolder ? formatFolderLabel(topFolder[0]) : "No dominant folder yet",
        description: topFolder ? `${topFolder[1]} milestones are clustered here.` : "Spread a few events across folders to reveal patterns."
      },
      {
        label: "Richest milestone",
        value: highestValue ? highestValue.title : "No amount tracked yet",
        description: highestValue ? `${formatCurrency(highestValue.amount)} is the highest tracked value in focus.` : "Use the amount field for homes, vehicles, deals, or major wins."
      },
      {
        label: "Future pull",
        value: `${reminderCount} reminder${reminderCount === 1 ? "" : "s"}`,
        description: "Scheduled nudges help the app keep inviting you back in."
      },
      {
        label: "Visual memory",
        value: `${imageRichCount} photo-rich event${imageRichCount === 1 ? "" : "s"}`,
        description: "Images make the story feel personal and instantly more sticky."
      }
    ];
  }

  function buildPrompts(visibleEvents) {
    if (!canCurrentUserEditWorkspace()) {
      return [
        {
          title: "Shared workspace is ready",
          body: "Browse the milestones the owner has chosen to share with you. Ask them if you need editing access.",
          actionLabel: "Open Timeline",
          action: "timeline"
        }
      ];
    }

    const prompts = [];
    const missingSummary = visibleEvents.find((event) => !event.summary);
    const missingPhoto = visibleEvents.find((event) => !event.attachments.length);
    const missingLocation = visibleEvents.find((event) => !event.location);
    const missingReminder = visibleEvents.find((event) => event.status !== "done" && !event.reminderDate);
    const activeEvent = visibleEvents.find((event) => event.status === "active");

    if (missingSummary) {
      prompts.push({ title: "Give a milestone a headline", body: `Add a one-line summary to ${missingSummary.title} so it stands out on the dashboard and story view.`, actionLabel: "Write Summary", eventId: missingSummary.id });
    }

    if (missingPhoto) {
      prompts.push({ title: "Add a photo or receipt", body: `Attach something visual to ${missingPhoto.title} to make the story more memorable.`, actionLabel: "Attach File", eventId: missingPhoto.id, action: "attach" });
    }

    if (missingLocation) {
      prompts.push({ title: "Anchor a chapter to a place", body: `Add a location to ${missingLocation.title} so future views feel more grounded.`, actionLabel: "Add Location", eventId: missingLocation.id });
    }

    if (missingReminder) {
      prompts.push({ title: "Set a follow-up reminder", body: `A reminder on ${missingReminder.title} will keep the app nudging you back in.`, actionLabel: "Set Reminder", eventId: missingReminder.id });
    }

    if (activeEvent) {
      prompts.push({ title: "Close the loop", body: `${activeEvent.title} is active. When it wraps, mark it done so your dashboard reflects progress.`, actionLabel: "Update Event", eventId: activeEvent.id });
    }

    if (!prompts.length) {
      prompts.push({ title: "You are in a strong rhythm", body: "Everything in focus already has strong detail. Add a brand-new chapter to keep the energy going.", actionLabel: "Add Event", action: "new" });
    }

    return prompts.slice(0, 4);
  }

  function renderPromptCards(prompts, mode) {
    return prompts
      .map(
        (prompt) => `
          <article class="promptCard ${mode === "sidebar" ? "miniPrompt" : ""}">
            <h4>${escapeHtml(prompt.title)}</h4>
            <p>${escapeHtml(prompt.body)}</p>
            <button class="promptAction" type="button" data-event-id="${escapeHtml(prompt.eventId || "")}" data-action="${escapeHtml(prompt.action || "edit")}">
              ${escapeHtml(prompt.actionLabel)}
            </button>
          </article>
        `
      )
      .join("");
  }

  document.addEventListener("click", (event) => {
    const promptButton = event.target.closest(".promptAction");
    if (!promptButton) return;

    const action = promptButton.dataset.action;
    const eventId = promptButton.dataset.eventId;

    if (action === "timeline") {
      showSection(timelineView, timelineTab);
      return;
    }

    if (action === "new") {
      if (!ensureWorkspaceEditAccess("add shared milestones")) return;
      resetForm();
      showSection(timelineView, timelineTab);
      title.focus();
      return;
    }

    const eventItem = events.find((item) => item.id === eventId);
    if (!eventItem) return;

    if (action === "attach") {
      openAttachmentPicker(eventItem.id);
      return;
    }

    if (!ensureWorkspaceEditAccess("edit shared milestones")) return;
    loadEventIntoForm(eventItem);
  });

  function renderMiniEventList(sourceEvents, emptyMessage) {
    if (!sourceEvents.length) {
      return `<div class="emptyState">${escapeHtml(emptyMessage)}</div>`;
    }

    return sourceEvents
      .map(
        (event) => `
          <button class="miniEventCard" type="button" data-open-event="${escapeHtml(event.id)}">
            <div>
              <strong>${escapeHtml(event.title)}</strong>
              <p>${escapeHtml(event.summary || event.notes || "No summary yet.")}</p>
            </div>
            <span>${escapeHtml(formatDate(event.reminderDate || event.startDate))}</span>
          </button>
        `
      )
      .join("");
  }

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-event]");
    if (!opener) return;

    const eventItem = events.find((item) => item.id === opener.dataset.openEvent);
    if (!eventItem) return;
    loadEventIntoForm(eventItem);
  });

  document.addEventListener("click", (event) => {
    const trashOpener = event.target.closest("[data-open-trash]");
    if (!trashOpener) return;

    showSection(trashView, trashTab);
  });

  function renderTimeline(visibleEvents) {
    timeline.innerHTML = "";
    const canReorder = canReorderTimeline();
    const canEditWorkspace = canCurrentUserEditWorkspace();

    if (!visibleEvents.length) {
      timeline.innerHTML = '<div class="emptyState">No events match your current filters yet.</div>';
      return;
    }

    visibleEvents.forEach((eventItem) => {
      const card = document.createElement("article");
      card.className = "eventCard";
      card.draggable = canReorder;
      card.dataset.eventId = eventItem.id;
      card.style.setProperty("--event-color", eventItem.color);

      card.innerHTML = `
        <div class="eventGlow"></div>
        <div class="eventHeader">
          <div>
            <div class="eventTopline">
              <span class="statusBadge ${escapeHtml(eventItem.status)}">${escapeHtml(eventItem.status)}</span>
              <span class="eventFolderPill">${escapeHtml(formatFolderLabel(eventItem.folder))}</span>
            </div>
            <h3>${escapeHtml(eventItem.title)}</h3>
            <p class="eventSummary">${escapeHtml(eventItem.summary || eventItem.notes || "No summary yet.")}</p>
          </div>
          <button class="menuBtn" type="button" aria-label="Open event menu">&#8942;</button>
          <div class="dropdown">
            <div class="subfolders">${activeDrawerEventId === eventItem.id ? "Hide Subfolders" : "Open Subfolders"}</div>
            ${canEditWorkspace ? '<div class="edit">Edit</div><div class="attach">Attach Files</div><div class="delete">Move to Trash</div>' : ""}
          </div>
        </div>
        <div class="eventMetaRow">
          <span>${escapeHtml(formatDate(eventItem.startDate))}${eventItem.endDate ? ` - ${escapeHtml(formatDate(eventItem.endDate))}` : ""}</span>
          ${eventItem.location ? `<span>${escapeHtml(eventItem.location)}</span>` : ""}
          ${eventItem.amount ? `<span>${escapeHtml(formatCurrency(eventItem.amount))}</span>` : ""}
          ${eventItem.reminderDate ? `<span>Reminder ${escapeHtml(formatDate(eventItem.reminderDate))}</span>` : ""}
        </div>
        ${renderTagRow(eventItem)}
        ${renderPeopleRow(eventItem.people)}
        ${renderCustomFieldsMarkup(eventItem.customFields)}
        ${renderExternalLink(eventItem.externalLink)}
        ${renderAttachmentMarkup(eventItem.attachments)}
        ${activeDrawerEventId === eventItem.id ? "" : renderSectionsMarkup(eventItem)}
        ${activeDrawerEventId === eventItem.id ? renderInlineWorkspace(eventItem) : ""}
      `;

      if (canReorder) {
        card.addEventListener("dragstart", () => {
          draggedEventId = eventItem.id;
          suppressDrawerOpenUntil = Date.now() + 400;
          card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
          draggedEventId = null;
          suppressDrawerOpenUntil = Date.now() + 400;
          card.classList.remove("dragging");
        });

        card.addEventListener("dragover", (event) => {
          event.preventDefault();
          card.classList.add("dragTarget");
        });

        card.addEventListener("dragleave", () => {
          card.classList.remove("dragTarget");
        });

        card.addEventListener("drop", async (event) => {
          event.preventDefault();
          card.classList.remove("dragTarget");
          await reorderEvents(eventItem.id);
        });
      }

      card.addEventListener("click", (event) => {
        if (Date.now() < suppressDrawerOpenUntil) return;
        if (event.target.closest(".menuBtn, .dropdown, .attachmentLink, .externalLink, button, a, input, textarea, select, summary")) {
          return;
        }
        toggleEventWorkspace(eventItem.id);
      });

      card.querySelector(".subfolders").onclick = () => toggleEventWorkspace(eventItem.id);
      card.querySelector(".edit")?.addEventListener("click", () => loadEventIntoForm(eventItem));
      card.querySelector(".attach")?.addEventListener("click", () => openAttachmentPicker(eventItem.id));
      card.querySelector(".delete")?.addEventListener("click", () => moveToTrash(eventItem));
      bindWorkspaceInteractions(card, eventItem);

      timeline.appendChild(card);
    });
  }
  function renderTagRow(eventItem) {
    if (!eventItem.tags.length) return "";
    return `
      <div class="chipRow">
        ${eventItem.tags.map((tag) => `<span class="chip">#${escapeHtml(tag)}</span>`).join("")}
      </div>
    `;
  }

  function renderPeopleRow(people) {
    if (!people.length) return "";
    return `
      <div class="peopleRow">
        <span class="mutedLabel">People</span>
        <span>${people.map(escapeHtml).join(", ")}</span>
      </div>
    `;
  }

  function renderCustomFieldsMarkup(customFields) {
    if (!customFields?.length) return "";

    return `
      <div class="customFieldDisplay">
        ${customFields
          .map(
            (field) => `
              <div class="customFieldChip">
                <span>${escapeHtml(field.label)}</span>
                <strong>${escapeHtml(field.value || "-")}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  async function reorderEvents(dropTargetId) {
    if (!canReorderTimeline() || !draggedEventId || draggedEventId === dropTargetId) return;

    const visibleEvents = getVisibleEvents();
    const draggedIndex = visibleEvents.findIndex((event) => event.id === draggedEventId);
    const targetIndex = visibleEvents.findIndex((event) => event.id === dropTargetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const reorderedVisible = [...visibleEvents];
    const [movedEvent] = reorderedVisible.splice(draggedIndex, 1);
    reorderedVisible.splice(targetIndex, 0, movedEvent);

    const visibleIds = new Set(visibleEvents.map((event) => event.id));
    const globalSorted = getSortedEvents();
    const rebuiltOrder = [];
    let replacementIndex = 0;

    globalSorted.forEach((event) => {
      if (visibleIds.has(event.id)) {
        rebuiltOrder.push(reorderedVisible[replacementIndex]);
        replacementIndex += 1;
      } else {
        rebuiltOrder.push(event);
      }
    });

    const updates = rebuiltOrder
      .map((event, index) => ({ event, order: index + 1 }))
      .filter(({ event, order }) => Number(event.order) !== order);

    await Promise.all(
      updates.map(({ event, order }) =>
        updateDoc(
          doc(db, "events", event.id),
          buildEventDocumentPayload(event, { order, updatedAt: Date.now() })
        )
      )
    );
    setStatus("Timeline order saved.", "success");
  }

  function canReorderTimeline() {
    return sortMode === "custom" && canCurrentUserEditWorkspace();
  }

  function renderTable(visibleEvents) {
    tableBody.innerHTML = "";

    if (!visibleEvents.length) {
      tableBody.innerHTML = '<tr><td colspan="8" class="emptyTable">No events match this view yet.</td></tr>';
      return;
    }

    visibleEvents.forEach((eventItem) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(eventItem.title)}</td>
        <td>${escapeHtml(formatFolderLabel(eventItem.folder))}</td>
        <td>${escapeHtml(formatFolderLabel(eventItem.status))}</td>
        <td>${escapeHtml(formatDate(eventItem.startDate))}</td>
        <td>${escapeHtml(eventItem.endDate ? formatDate(eventItem.endDate) : "-")}</td>
        <td>${escapeHtml(eventItem.location || "-")}</td>
        <td>${escapeHtml(eventItem.amount ? formatCurrency(eventItem.amount) : "-")}</td>
        <td>${escapeHtml(eventItem.tags.join(", ") || "-")}</td>
      `;
      tableBody.appendChild(row);
    });
  }

  function renderVerticalTimeline(visibleEvents) {
    verticalTimeline.innerHTML = "";

    if (!visibleEvents.length) {
      verticalTimeline.innerHTML = '<div class="emptyState">No events to map on the infographic timeline.</div>';
      return;
    }

    visibleEvents.forEach((eventItem, index) => {
      const node = document.createElement("article");
      node.className = "verticalNode";
      node.style.setProperty("--event-color", eventItem.color);
      node.innerHTML = `
        <div class="verticalDot"></div>
        <div class="verticalCard">
          <div class="verticalStep">Chapter ${index + 1}</div>
          <h3>${escapeHtml(eventItem.title)}</h3>
          <p>${escapeHtml(eventItem.summary || eventItem.notes || "No summary yet.")}</p>
          <div class="verticalMeta">
            <span>${escapeHtml(formatFolderLabel(eventItem.folder))}</span>
            <span>${escapeHtml(formatDate(eventItem.startDate))}</span>
            <span>${escapeHtml(formatFolderLabel(eventItem.status))}</span>
          </div>
          ${renderTagRow(eventItem)}
          ${renderCustomFieldsMarkup(eventItem.customFields)}
          ${renderAttachmentMarkup(eventItem.attachments)}
        </div>
      `;
      verticalTimeline.appendChild(node);
    });
  }

  function renderSpotlightGraph(visibleEvents) {
    spotlightGraph.innerHTML = "";

    if (!visibleEvents.length) {
      spotlightGraph.innerHTML = '<div class="emptyState">No events to spotlight right now.</div>';
      return;
    }

    visibleEvents.forEach((eventItem, index) => {
      const width = Math.max(40, 100 - index * 7);
      const card = document.createElement("article");
      card.className = "spotlightCard";
      card.style.setProperty("--event-color", eventItem.color);
      card.style.width = `${width}%`;
      card.innerHTML = `
        <div class="spotlightTop">
          <span class="spotlightOrder">${String(index + 1).padStart(2, "0")}</span>
          <span class="spotlightFolder">${escapeHtml(formatFolderLabel(eventItem.folder))}</span>
        </div>
        <h3>${escapeHtml(eventItem.title)}</h3>
        <p>${escapeHtml(eventItem.summary || eventItem.notes || "No summary yet.")}</p>
        <div class="spotlightDates">${escapeHtml(formatDate(eventItem.startDate))}${eventItem.endDate ? ` - ${escapeHtml(formatDate(eventItem.endDate))}` : ""}</div>
      `;
      spotlightGraph.appendChild(card);
    });
  }

  function renderStoryStudio(visibleEvents) {
    const highlights = buildStoryHighlights(visibleEvents);
    storyHeadline.textContent = visibleEvents.length
      ? `${visibleEvents.length} chapter${visibleEvents.length === 1 ? "" : "s"} arranged into one cinematic arc.`
      : "Your story studio will come alive as soon as you add a chapter.";

    storyHighlights.innerHTML = highlights
      .map(
        (highlight) => `
          <article class="storyBadge">
            <p>${escapeHtml(highlight.label)}</p>
            <h3>${escapeHtml(highlight.value)}</h3>
          </article>
        `
      )
      .join("");

    if (!visibleEvents.length) {
      storyScene.innerHTML = '<div class="emptyState">Add a milestone to generate your printable story layout.</div>';
      return;
    }

    const leadEvent = visibleEvents[0];
    storyScene.innerHTML = `
      <section class="storyLead panel">
        <p class="eyebrow">Lead chapter</p>
        <h2>${escapeHtml(leadEvent.title)}</h2>
        <p>${escapeHtml(leadEvent.summary || leadEvent.notes || "No summary yet.")}</p>
        <div class="storyMetaRow">
          <span>${escapeHtml(formatFolderLabel(leadEvent.folder))}</span>
          <span>${escapeHtml(formatDate(leadEvent.startDate))}</span>
          <span>${escapeHtml(formatFolderLabel(leadEvent.status))}</span>
        </div>
        ${renderCustomFieldsMarkup(leadEvent.customFields)}
      </section>
      <section class="storyColumns">
        <div class="storyColumn panel">
          <h3>Highlights Reel</h3>
          ${visibleEvents
            .slice(0, 6)
            .map(
              (event, index) => `
                <article class="storyBeat">
                  <span class="storyIndex">${index + 1}</span>
                  <div>
                    <strong>${escapeHtml(event.title)}</strong>
                    <p>${escapeHtml(event.summary || event.notes || "No summary yet.")}</p>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
        <div class="storyColumn panel">
          <h3>Shareable Narrative</h3>
          <p class="storyNarrative">${escapeHtml(buildNarrativeParagraph(visibleEvents))}</p>
          <div class="storyQuotes">
            ${visibleEvents
              .slice(0, 3)
              .map(
                (event) => `
                  <blockquote>
                    <p>${escapeHtml(event.summary || event.title)}</p>
                    <footer>${escapeHtml(formatDate(event.startDate))} in ${escapeHtml(formatFolderLabel(event.folder))}</footer>
                  </blockquote>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  }

  function buildStoryHighlights(visibleEvents) {
    const firstDate = visibleEvents[0]?.startDate;
    const lastDate = visibleEvents[visibleEvents.length - 1]?.startDate;
    const withLinks = visibleEvents.filter((event) => event.externalLink).length;

    return [
      { label: "Chapters in view", value: String(visibleEvents.length) },
      { label: "Story span", value: firstDate && lastDate ? `${formatDate(firstDate)} to ${formatDate(lastDate)}` : "Just getting started" },
      { label: "Linked receipts", value: String(withLinks) }
    ];
  }

  function buildNarrativeParagraph(visibleEvents) {
    if (!visibleEvents.length) {
      return "Start adding milestones and this studio will turn them into a polished narrative you can export or share.";
    }

    const folderNames = [...new Set(visibleEvents.map((event) => formatFolderLabel(event.folder)))].join(", ");
    const first = visibleEvents[0];
    const latest = visibleEvents[visibleEvents.length - 1];

    return `${first.title} opens the visible arc on ${formatDate(first.startDate)}. Across ${visibleEvents.length} milestone${visibleEvents.length === 1 ? "" : "s"}, this story moves through ${folderNames}. The latest chapter in focus is ${latest.title}, showing how the narrative keeps evolving instead of standing still.`;
  }

  function buildStorySummary(visibleEvents) {
    const lines = ["Chronicle Canvas Story Summary", "", buildNarrativeParagraph(visibleEvents), "", "Highlights:"];

    visibleEvents.slice(0, 8).forEach((event, index) => {
      lines.push(`${index + 1}. ${event.title} | ${formatDate(event.startDate)} | ${formatFolderLabel(event.folder)} | ${event.summary || event.notes || "No summary yet."}`);
      if (event.showSectionSummary && event.sections.length) {
        lines.push(`   Subfolders: ${buildSectionSummaryText(event)}`);
      }
    });

    return lines.join("\n");
  }

  function renderTrash() {
    trashList.innerHTML = "";
    const canEditWorkspace = canCurrentUserEditWorkspace();

    if (!trash.length) {
      trashList.innerHTML = '<div class="emptyState">Trash is empty.</div>';
      return;
    }

    trash.forEach((trashItem) => {
      const trashCard = document.createElement("article");
      trashCard.className = "trashCard";
      trashCard.innerHTML = `
        <div class="trashTop">
          <div>
            <h3>${escapeHtml(trashItem.title)}</h3>
            <p>${escapeHtml(trashItem.summary || trashItem.notes || "No summary yet.")}</p>
          </div>
          <span class="eventFolderPill">${escapeHtml(formatFolderLabel(trashItem.folder))}</span>
        </div>
        <div class="eventMetaRow">
          <span>${escapeHtml(formatDate(trashItem.startDate))}</span>
          <span>${escapeHtml(formatFolderLabel(trashItem.status))}</span>
        </div>
        ${renderCustomFieldsMarkup(trashItem.customFields)}
        ${renderAttachmentMarkup(trashItem.attachments)}
        ${renderSectionsMarkup(trashItem)}
        ${canEditWorkspace ? `
          <div class="trashActions">
            <button class="restoreBtn" type="button">Restore</button>
            <button class="deleteBtn" type="button">Delete Forever</button>
          </div>
        ` : ""}
      `;

      trashCard.querySelector(".restoreBtn")?.addEventListener("click", () => restore(trashItem));
      trashCard.querySelector(".deleteBtn")?.addEventListener("click", () => deleteForever(trashItem));
      trashList.appendChild(trashCard);
    });
  }

  function setupViewSwitches() {
    const panels = {
      table: document.getElementById("tablePanel"),
      vertical: document.getElementById("verticalPanel"),
      spotlight: document.getElementById("spotlightPanel")
    };

    document.querySelectorAll(".viewBtn").forEach((button) => {
      button.onclick = () => {
        activeViewGraph = button.dataset.view;

        document.querySelectorAll(".viewBtn").forEach((viewButton) => {
          viewButton.classList.toggle("active", viewButton.dataset.view === activeViewGraph);
        });

        Object.entries(panels).forEach(([key, panel]) => {
          panel.style.display = key === activeViewGraph ? "block" : "none";
          panel.classList.toggle("active", key === activeViewGraph);
        });

        render();
      };
    });
  }
});
