// GDPR Case Management System - Clean Working Version
// Contract ABI and address
const contractAddress = "0xb7395513E595FC1Cf84882592AB08932Ff59F715"; // UPDATE THIS

// Variables
let provider, signer, contract;
let currentAccount = null;
let isAdmin = false;
let isJudge = false;
let isDPO = false;
let currentCaseId = null;
let loadingModal;
let alertModal;

// Contract ABI
const contractABI = [
  "function getCaseCount() view returns (uint256)",
  "function caseExists(uint256 _caseId) view returns (bool)",
  "function getCaseBasicDetails(uint256 _caseId) view returns (uint256 id, bytes32 caseHash, bytes32 dataClassification, uint256 filingDate, uint256 lastUpdated, uint8 status, uint8 caseType, bool isGDPRCase)",
  "function getCasePartyDetails(uint256 _caseId) view returns (address assignedJudge, uint256 nextHearingDate, uint256 totalDocuments, uint256 retentionPeriod)",
  "function getDocument(uint256 _caseId, uint256 _docId) view returns (uint256 id, bytes32 ipfsHash, bytes32 documentTypeHash, address submitter, uint256 submissionDate, bool isEncrypted)",
  "function getUserDataSubjectRequests(address _user) view returns (uint256[])",
  "function getPendingDataSubjectRequests() view returns (uint256[])",
  "function getDataSubjectRequest(uint256 _requestId) view returns (uint256 id, uint256 caseId, address requester, uint8 requestType, uint8 status, uint256 requestDate, uint256 responseDeadline)",
  "function isEncryptionKeyRevoked(bytes32 _keyHash) view returns (bool)",
  "function exportCaseForROPA(uint256 _caseId) view returns (bytes32 caseHash, bytes32 dataClassification, uint8 caseType, bytes32 legalBasisType, uint256 retentionPeriod, uint256 filingDate, bool isGDPRCase)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function registerCase(bytes32 _caseHash, bytes32 _dataClassification, uint8 _caseType, bool _requiresEncryption, uint256 _retentionPeriod, bytes32 _legalBasisHash) returns (uint256)",
  "function submitDocument(uint256 _caseId, bytes32 _ipfsHash, bytes32 _documentTypeHash, bytes32 _encryptionKeyHash, bool _isEncrypted) returns (uint256)",
  "function createDataSubjectRequest(uint256 _caseId, uint8 _requestType, bytes32 _requestDetailsHash) returns (uint256)",
  "function processDataSubjectRequest(uint256 _requestId, uint8 _status, bytes32 _responseHash)",
  "function revokeEncryptionKey(uint256 _caseId, bytes32 _keyHash)",
  "function archiveExpiredCases()",
  "function generateAccessReport(uint256 _caseId, address _dataSubject) returns (bytes32)",
  "function assignJudge(uint256 _caseId, address _judgeAddress)",
  "function scheduleHearing(uint256 _caseId, uint256 _hearingDate)",
  "function updateCaseStatus(uint256 _caseId, uint8 _status)",
  "function addJudge(address _judgeAddress)",
  "function addDPO(address _dpoAddress)",
  "function pause()",
  "function unpause()"
];

// Role constants
const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const JUDGE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("JUDGE_ROLE"));
const DPO_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("DPO_ROLE"));

// Enums
const CaseStatus = { 0: "Registered", 1: "In Progress", 2: "Decided", 3: "Closed", 4: "Archived" };
const CaseType = { 0: "General", 1: "GDPR", 2: "Data Breach", 3: "Cross Border" };
const RequestType = { 0: "Access", 1: "Rectification", 2: "Erasure", 3: "Portability", 4: "Processing" };
const RequestStatus = { 0: "Pending", 1: "Approved", 2: "Rejected", 3: "Completed" };

// Helper functions
function formatDate(timestamp) {
  if (!timestamp || timestamp == 0) return "Not set";
  return new Date(timestamp * 1000).toLocaleString();
}

function formatAddress(address) {
  if (!address || address === "0x0000000000000000000000000000000000000000") return "Not assigned";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function getStatusText(statusCode) { return CaseStatus[statusCode] || "Unknown"; }
function getCaseTypeText(typeCode) { return CaseType[typeCode] || "Unknown"; }
function getRequestTypeText(typeCode) { return RequestType[typeCode] || "Unknown"; }
function getRequestStatusText(statusCode) { return RequestStatus[statusCode] || "Unknown"; }

function getStatusClass(statusCode) {
  const classMap = { 0: "case-status-registered", 1: "case-status-inprogress", 2: "case-status-decided", 3: "case-status-closed", 4: "case-status-archived" };
  return classMap[statusCode] || "";
}

function getRequestStatusColor(statusCode) {
  const colorMap = { 0: "warning", 1: "success", 2: "danger", 3: "primary" };
  return colorMap[statusCode] || "secondary";
}

function textToHash(text) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text));
}

// Modal functions
function showLoading(message = "Processing...") {
  document.getElementById("loadingModalText").textContent = message;
  if (loadingModal) loadingModal.show();
}

function hideLoading() {
  if (loadingModal) {
    loadingModal.hide();
  }
  
  // Force cleanup - more thorough
  setTimeout(() => {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    
    // Make sure the modal is really hidden
    const modalElement = document.getElementById('loadingModal');
    if (modalElement) {
      modalElement.classList.remove('show');
      modalElement.style.display = 'none';
      modalElement.setAttribute('aria-hidden', 'true');
    }
  }, 100);
}

function showAlert(title, message) {
  document.getElementById("alertModalTitle").textContent = title;
  document.getElementById("alertModalBody").textContent = message;
  if (alertModal) alertModal.show();
}

function handleError(error) {
  hideLoading();
  console.error("Error:", error);
  let errorMessage = "Transaction failed. Please try again.";
  
  if (error.message) {
    if (error.message.includes("User denied")) {
      errorMessage = "Transaction was rejected by the user.";
    } else if (error.message.includes("revert")) {
      const revertReason = error.message.match(/revert\s(.*?)(?:,|$)/);
      if (revertReason) {
        errorMessage = `Transaction reverted: ${revertReason[1]}`;
      }
    }
  }
  
  showAlert("Error", errorMessage);
}

// Navigation
function showSection(sectionId) {
  document.querySelectorAll('.section-content').forEach(section => {
    section.style.display = 'none';
  });
  document.getElementById(sectionId).style.display = 'block';
  
  // Update nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  
  const navLinkMap = {
    'homeSection': 'homeNav',
    'registerCaseSection': 'registerCaseNav',
    'casesSection': 'casesNav',
    'adminSection': 'adminNav',
    'gdprSection': 'gdprNav',
    'dpoSection': 'dpoNav',
    'caseDetailsSection': null
  };
  
  const navId = navLinkMap[sectionId];
  if (navId && document.getElementById(navId)) {
    document.getElementById(navId).classList.add('active');
  }
}

// Connect wallet
async function connectWallet() {
  if (!window.ethereum) {
    showAlert("MetaMask Required", "Please install MetaMask to use this application.");
    return;
  }

  try {
    showLoading("Connecting to wallet...");
    
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    currentAccount = accounts[0];
    
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    contract = new ethers.Contract(contractAddress, contractABI, signer);
    
    // Update UI
    document.getElementById("accountAddress").textContent = formatAddress(currentAccount);
    document.getElementById("connectWallet").style.display = "none";
    document.getElementById("disconnectWallet").style.display = "inline-block";
    document.getElementById("connectionAlert").style.display = "none";
    
    // Check roles
    try {
      isAdmin = await contract.hasRole(ADMIN_ROLE, currentAccount);
      isJudge = await contract.hasRole(JUDGE_ROLE, currentAccount);
      isDPO = await contract.hasRole(DPO_ROLE, currentAccount);
      
      // Show role-specific elements
      if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
      }
      if (isJudge) {
        document.querySelectorAll('.judge-only').forEach(el => el.style.display = 'block');
      }
      if (isDPO) {
        document.querySelectorAll('.dpo-only').forEach(el => el.style.display = 'block');
      }
      
      loadCaseList();
      
      // Hide loading first, then show success message
      hideLoading();
      setTimeout(() => {
        showAlert("Success", "Wallet connected successfully!");
      }, 200);
      
    } catch (roleError) {
      hideLoading();
      setTimeout(() => {
        showAlert("Warning", "Connected to wallet but could not verify roles. Contract may not be deployed.");
      }, 200);
    }
    
  } catch (error) {
    hideLoading();
    console.error("Connection error:", error);
    setTimeout(() => {
      showAlert("Connection Error", "Could not connect to wallet. Please try again.");
    }, 200);
  }
}

// Disconnect wallet
function disconnectWallet() {
  currentAccount = null;
  provider = null;
  signer = null;
  contract = null;
  isAdmin = false;
  isJudge = false;
  isDPO = false;
  
  document.getElementById("accountAddress").textContent = "Not connected";
  document.getElementById("connectWallet").style.display = "inline-block";
  document.getElementById("disconnectWallet").style.display = "none";
  document.getElementById("connectionAlert").style.display = "block";
  
  document.querySelectorAll('.admin-only, .judge-only, .dpo-only').forEach(el => {
    el.style.display = 'none';
  });
  
  showSection('homeSection');
}

// Load case list
async function loadCaseList() {
  if (!contract) return;
  
  try {
    const caseCount = await contract.getCaseCount();
    const totalCases = caseCount.toNumber();
    const caseListBody = document.getElementById('caseListBody');
    caseListBody.innerHTML = '';
    
    if (totalCases == 0) {
      caseListBody.innerHTML = `<tr><td colspan="6" class="text-center">No cases found</td></tr>`;
      return;
    }
    
    for (let i = 1; i <= totalCases; i++) {
      try {
        const exists = await contract.caseExists(i);
        if (!exists) continue;
        
        const basicDetails = await contract.getCaseBasicDetails(i);
        const row = document.createElement('tr');
        
        const statusClass = getStatusClass(basicDetails.status);
        const statusText = getStatusText(basicDetails.status);
        const caseTypeText = getCaseTypeText(basicDetails.caseType);
        const caseHashShort = basicDetails.caseHash.substring(0, 10) + "...";
        
        row.innerHTML = `
          <td>${i}</td>
          <td>${caseHashShort}</td>
          <td>${caseTypeText}</td>
          <td>${formatDate(basicDetails.filingDate.toNumber())}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn btn-sm btn-primary view-case-btn" data-case-id="${i}">
              View Details
            </button>
          </td>
        `;
        
        caseListBody.appendChild(row);
      } catch (error) {
        console.error(`Error loading case ${i}:`, error);
      }
    }
    
    // Add event listeners
    document.querySelectorAll('.view-case-btn').forEach(button => {
      button.addEventListener('click', () => {
        const caseId = button.getAttribute('data-case-id');
        loadCaseDetails(caseId);
      });
    });
    
  } catch (error) {
    showAlert("Error", "Failed to load case list");
  }
}

// Load case details
async function loadCaseDetails(caseId) {
  if (!contract) return;
  
  try {
    currentCaseId = caseId;
    
    document.getElementById('caseIdBadge').textContent = `#${caseId}`;
    
    const basicDetails = await contract.getCaseBasicDetails(caseId);
    
    // Populate basic info
    document.getElementById('detailCaseHash').textContent = basicDetails.caseHash;
    document.getElementById('detailCaseType').textContent = getCaseTypeText(basicDetails.caseType);
    document.getElementById('detailFilingDate').textContent = formatDate(basicDetails.filingDate.toNumber());
    document.getElementById('detailLastUpdated').textContent = formatDate(basicDetails.lastUpdated.toNumber());
    document.getElementById('detailIsGDPR').textContent = basicDetails.isGDPRCase ? "Yes" : "No";
    
    const statusClass = getStatusClass(basicDetails.status);
    const statusText = getStatusText(basicDetails.status);
    document.getElementById('detailStatus').innerHTML = `<span class="${statusClass}">${statusText}</span>`;
    
    try {
      const partyDetails = await contract.getCasePartyDetails(caseId);
      
      document.getElementById('detailJudge').textContent = partyDetails.assignedJudge === "0x0000000000000000000000000000000000000000" 
        ? "Not assigned" 
        : partyDetails.assignedJudge;
      document.getElementById('detailNextHearing').textContent = partyDetails.nextHearingDate.toNumber() > 0 
        ? formatDate(partyDetails.nextHearingDate.toNumber()) 
        : "Not scheduled";
      document.getElementById('detailRetentionPeriod').textContent = Math.floor(partyDetails.retentionPeriod.toNumber() / (24*60*60)) + " days";
      
      await loadCaseDocuments(caseId, partyDetails.totalDocuments.toNumber());
      document.getElementById('caseActionsCard').style.display = 'block';
    } catch (error) {
      document.getElementById('detailJudge').textContent = "Access restricted";
      document.getElementById('detailNextHearing').textContent = "Access restricted";
      document.getElementById('detailRetentionPeriod').textContent = "Access restricted";
      document.getElementById('caseActionsCard').style.display = 'none';
    }
    
    showSection('caseDetailsSection');
  } catch (error) {
    showAlert("Error", "Failed to load case details");
  }
}

// Load case documents
async function loadCaseDocuments(caseId, documentCount) {
  const documentListBody = document.getElementById('documentListBody');
  documentListBody.innerHTML = '';
  
  if (documentCount == 0) {
    documentListBody.innerHTML = `<tr><td colspan="7" class="text-center">No documents found</td></tr>`;
    return;
  }
  
  for (let i = 1; i <= documentCount; i++) {
    try {
      const doc = await contract.getDocument(caseId, i);
      
      let accessStatus = "Accessible";
      let accessClass = "text-success";
      let accessIcon = "fas fa-check-circle";
      
      if (doc.isEncrypted && doc.encryptionKeyHash !== ethers.constants.HashZero) {
        try {
          const isRevoked = await contract.isEncryptionKeyRevoked(doc.encryptionKeyHash);
          if (isRevoked) {
            accessStatus = "Revoked (Erasure)";
            accessClass = "text-danger";
            accessIcon = "fas fa-ban";
          }
        } catch (error) {
          // Ignore revocation check errors
        }
      }
      
      const row = document.createElement('tr');
      const docHashShort = doc.ipfsHash.substring(0, 10) + "...";
      const docTypeHashShort = doc.documentTypeHash.substring(0, 10) + "...";
      
      row.innerHTML = `
        <td>${doc.id.toNumber()}</td>
        <td>${docTypeHashShort}</td>
        <td>${formatAddress(doc.submitter)}</td>
        <td>${formatDate(doc.submissionDate.toNumber())}</td>
        <td>${doc.isEncrypted ? '<span class="encryption-badge">Encrypted</span>' : 'No'}</td>
        <td><span class="${accessClass}"><i class="${accessIcon}"></i> ${accessStatus}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary" ${accessStatus === "Revoked (Erasure)" ? 'disabled' : ''}>
            ${accessStatus === "Revoked (Erasure)" ? 'Access Denied' : 'View Hash'}
          </button>
        </td>
      `;
      
      documentListBody.appendChild(row);
    } catch (error) {
      const errorRow = document.createElement('tr');
      errorRow.innerHTML = `
        <td>${i}</td>
        <td colspan="6" class="text-muted">Access restricted or document unavailable</td>
      `;
      documentListBody.appendChild(errorRow);
    }
  }
}

// Register case
async function registerCase(caseTitle, caseDescription, initialDocIpfs, dataClassification, caseType, requiresEncryption, retentionDays, legalBasis) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Registering case...");
    
    const caseDetails = { title: caseTitle, description: caseDescription, initialDocument: initialDocIpfs };
    const caseHash = textToHash(JSON.stringify(caseDetails));
    const dataClassHash = textToHash(dataClassification);
    const legalBasisHash = textToHash(legalBasis);
    const retentionPeriod = retentionDays * 24 * 60 * 60;
    
    const tx = await contract.registerCase(caseHash, dataClassHash, caseType, requiresEncryption, retentionPeriod, legalBasisHash);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Case registered successfully!");
    document.getElementById('registerCaseForm').reset();
    showSection('casesSection');
    loadCaseList();
  } catch (error) {
    handleError(error);
  }
}

// Submit document
async function submitDocument(caseId, ipfsHash, documentType, encryptionKey, isEncrypted) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Submitting document...");
    
    const ipfsHashBytes32 = textToHash(ipfsHash);
    const docTypeHash = textToHash(documentType);
    const encKeyHash = encryptionKey ? textToHash(encryptionKey) : ethers.constants.HashZero;
    
    const tx = await contract.submitDocument(caseId, ipfsHashBytes32, docTypeHash, encKeyHash, isEncrypted);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Document submitted successfully!");
    loadCaseDetails(caseId);
  } catch (error) {
    handleError(error);
  }
}

// Add judge
async function addJudge(judgeAddress) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  if (!ethers.utils.isAddress(judgeAddress)) {
    showAlert("Invalid Address", "Please enter a valid Ethereum address");
    return;
  }
  
  try {
    showLoading("Adding case reviewer...");
    
    const tx = await contract.addJudge(judgeAddress);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Case reviewer added successfully!");
    document.getElementById('newJudgeAddress').value = '';
  } catch (error) {
    handleError(error);
  }
}

// Add DPO
async function addDPO(dpoAddress) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  if (!ethers.utils.isAddress(dpoAddress)) {
    showAlert("Invalid Address", "Please enter a valid Ethereum address");
    return;
  }
  
  try {
    showLoading("Adding Data Protection Officer...");
    
    const tx = await contract.addDPO(dpoAddress);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Data Protection Officer added successfully!");
    document.getElementById('newDPOAddress').value = '';
  } catch (error) {
    handleError(error);
  }
}

// Assign judge to case
async function assignJudge(caseId, judgeAddress) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  if (!ethers.utils.isAddress(judgeAddress)) {
    showAlert("Invalid Address", "Please enter a valid Ethereum address");
    return;
  }
  
  try {
    showLoading("Assigning case reviewer...");
    
    const tx = await contract.assignJudge(caseId, judgeAddress);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Case reviewer assigned successfully!");
    document.getElementById('judgeAddressInput').value = '';
    loadCaseDetails(caseId); // Refresh case details
  } catch (error) {
    handleError(error);
  }
}

// Schedule hearing
async function scheduleHearing(caseId, hearingDateTimestamp) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Scheduling meeting...");
    
    const tx = await contract.scheduleHearing(caseId, hearingDateTimestamp);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Meeting scheduled successfully!");
    loadCaseDetails(caseId); // Refresh case details
  } catch (error) {
    handleError(error);
  }
}

// Update case status
async function updateCaseStatus(caseId, statusCode) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Updating case status...");
    
    const tx = await contract.updateCaseStatus(caseId, statusCode);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Case status updated successfully!");
    loadCaseDetails(caseId); // Refresh case details
  } catch (error) {
    handleError(error);
  }
}

// Revoke encryption key (DPO function)
async function revokeEncryptionKey(caseId, keyReference) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Revoking encryption key...");
    
    const keyHash = textToHash(keyReference);
    const tx = await contract.revokeEncryptionKey(caseId, keyHash);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Encryption key revoked successfully! Associated data is now unreadable.");
    document.getElementById('revokeKeyCase').value = '';
    document.getElementById('revokeKeyHash').value = '';
  } catch (error) {
    handleError(error);
  }
}

// Create data subject request
async function createDataSubjectRequest(caseId, requestType, requestDetails) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Creating data subject request...");
    
    const requestHash = textToHash(requestDetails);
    const tx = await contract.createDataSubjectRequest(caseId, requestType, requestHash);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Data subject request created successfully!");
    document.getElementById('requestDetails').value = '';
    loadRequestHistory();
  } catch (error) {
    handleError(error);
  }
}

// Load request history
async function loadRequestHistory() {
  if (!contract || !currentAccount) return;
  
  try {
    const requestHistoryBody = document.getElementById('requestHistoryBody');
    requestHistoryBody.innerHTML = '';
    
    const requestIds = await contract.getUserDataSubjectRequests(currentAccount);
    
    if (requestIds.length === 0) {
      requestHistoryBody.innerHTML = `<tr><td colspan="6" class="text-center">No requests found</td></tr>`;
      return;
    }
    
    for (let i = 0; i < requestIds.length; i++) {
      try {
        const requestDetails = await contract.getDataSubjectRequest(requestIds[i]);
        const row = document.createElement('tr');
        const isOverdue = Date.now() / 1000 > requestDetails.responseDeadline.toNumber();
        
        row.innerHTML = `
          <td>${requestDetails.id.toNumber()}</td>
          <td>${requestDetails.caseId.toNumber()}</td>
          <td>${getRequestTypeText(requestDetails.requestType)}</td>
          <td><span class="badge bg-${getRequestStatusColor(requestDetails.status)}">${getRequestStatusText(requestDetails.status)}</span></td>
          <td>${formatDate(requestDetails.requestDate.toNumber())}</td>
          <td class="${isOverdue ? 'text-danger' : ''}">${formatDate(requestDetails.responseDeadline.toNumber())} ${isOverdue ? '(Overdue)' : ''}</td>
        `;
        
        requestHistoryBody.appendChild(row);
      } catch (error) {
        console.error(`Error loading request ${requestIds[i]}:`, error);
      }
    }
    
  } catch (error) {
    console.log("No request history available");
    document.getElementById('requestHistoryBody').innerHTML = `<tr><td colspan="6" class="text-center text-muted">No request history available</td></tr>`;
  }
}

// Load DPO Dashboard
async function loadDPODashboard() {
  if (!contract) return;
  
  try {
    const requestsList = document.getElementById('dpoRequestsList');
    requestsList.innerHTML = '';
    
    const pendingRequestIds = await contract.getPendingDataSubjectRequests();
    
    if (pendingRequestIds.length === 0) {
      requestsList.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-success">
            <i class="fas fa-check-circle"></i> 
            No pending requests - All requests processed!
          </td>
        </tr>
      `;
      return;
    }
    
    for (let i = 0; i < pendingRequestIds.length; i++) {
      try {
        const requestDetails = await contract.getDataSubjectRequest(pendingRequestIds[i]);
        const row = document.createElement('tr');
        const isOverdue = Date.now() / 1000 > requestDetails.responseDeadline.toNumber();
        
        if (isOverdue) row.className = 'table-danger';
        
        row.innerHTML = `
          <td>${requestDetails.id.toNumber()}</td>
          <td>${requestDetails.caseId.toNumber()}</td>
          <td>${formatAddress(requestDetails.requester)}</td>
          <td>${getRequestTypeText(requestDetails.requestType)}</td>
          <td>${formatDate(requestDetails.requestDate.toNumber())}</td>
          <td>${formatDate(requestDetails.responseDeadline.toNumber())} ${isOverdue ? '<span class="badge bg-danger">OVERDUE</span>' : ''}</td>
          <td><span class="badge bg-warning">Pending</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('requestIdInput').value='${requestDetails.id.toNumber()}'; document.getElementById('requestIdInput').scrollIntoView();">
              Process
            </button>
          </td>
        `;
        
        requestsList.appendChild(row);
      } catch (error) {
        console.error(`Error loading request ${pendingRequestIds[i]}:`, error);
      }
    }
    
  } catch (error) {
    document.getElementById('dpoRequestsList').innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted">
          Access restricted or no requests available
        </td>
      </tr>
    `;
  }
}

// Process data subject request
async function processDataSubjectRequest(requestId, status, responseDetails) {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    showLoading("Processing data subject request...");
    
    const responseHash = textToHash(responseDetails);
    const tx = await contract.processDataSubjectRequest(requestId, status, responseHash);
    await tx.wait();
    
    hideLoading();
    showAlert("Success", "Data subject request processed successfully!");
    loadDPODashboard();
  } catch (error) {
    handleError(error);
  }
}

// Archive expired cases
async function archiveExpiredCases() {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    const tx = await contract.archiveExpiredCases();
    await tx.wait();
    
    showAlert("Success", "Expired cases have been archived successfully!");
    loadCaseList();
  } catch (error) {
    handleError(error);
  }
}

// Generate ROPA report
async function generateROPAReport() {
  if (!contract) {
    showAlert("Not Connected", "Please connect your wallet first");
    return;
  }
  
  try {
    const caseCount = await contract.getCaseCount();
    const totalCases = caseCount.toNumber();
    let ropaData = [];
    
    for (let i = 1; i <= totalCases; i++) {
      try {
        const exists = await contract.caseExists(i);
        if (!exists) continue;
        
        const ropaInfo = await contract.exportCaseForROPA(i);
        ropaData.push({
          caseId: i,
          caseHash: ropaInfo.caseHash,
          dataClassification: ropaInfo.dataClassification,
          caseType: getCaseTypeText(ropaInfo.caseType),
          retentionPeriod: Math.floor(ropaInfo.retentionPeriod.toNumber() / (24*60*60)) + " days",
          filingDate: formatDate(ropaInfo.filingDate.toNumber()),
          isGDPRCase: ropaInfo.isGDPRCase
        });
      } catch (error) {
        console.warn(`Could not export case ${i} for ROPA`);
      }
    }
    
    const ropaReport = {
      generatedDate: new Date().toISOString(),
      generatedBy: currentAccount,
      totalCases: ropaData.length,
      gdprCases: ropaData.filter(c => c.isGDPRCase).length,
      cases: ropaData
    };
    
    const blob = new Blob([JSON.stringify(ropaReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GDPR_ROPA_Report_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showAlert("Success", `ROPA report generated with ${ropaData.length} cases!`);
  } catch (error) {
    handleError(error);
  }
}

// Generate DPIA template
function generateDPIATemplate() {
  const dpiaTemplate = {
    title: "Data Protection Impact Assessment (DPIA) Template",
    organization: "Your Organization Name",
    assessmentDate: new Date().toISOString().split('T')[0],
    assessor: currentAccount || "Not specified",
    sections: {
      "1_description": {
        title: "Description of Processing",
        questions: [
          "What is the nature of the processing?",
          "What is the scope of the processing?",
          "What is the context of the processing?",
          "What are the purposes of the processing?"
        ]
      },
      "2_necessity": {
        title: "Necessity and Proportionality",
        questions: [
          "What is the lawful basis for processing?",
          "Is the processing necessary for the specified purpose?",
          "Is the processing proportionate to the purpose?"
        ]
      },
      "3_risks": {
        title: "Risk Assessment",
        questions: [
          "What are the risks to individuals?",
          "What is the likelihood of occurrence?",
          "What is the severity of impact?",
          "What safeguards are in place?"
        ]
      }
    }
  };
  
  const blob = new Blob([JSON.stringify(dpiaTemplate, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GDPR_DPIA_Template_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showAlert("Success", "DPIA template downloaded!");
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  console.log("🚀 GDPR Case Management System Loading...");
  
  // Initialize modals
  loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
  alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
  
  // Wallet buttons
  document.getElementById('connectWallet').addEventListener('click', connectWallet);
  document.getElementById('disconnectWallet').addEventListener('click', disconnectWallet);
  
  // Navigation
  document.getElementById('homeNav').addEventListener('click', () => showSection('homeSection'));
  document.getElementById('registerCaseNav').addEventListener('click', () => showSection('registerCaseSection'));
  document.getElementById('casesNav').addEventListener('click', () => {
    showSection('casesSection');
    if (contract) loadCaseList();
  });
  
  if (document.getElementById('adminNav')) {
    document.getElementById('adminNav').addEventListener('click', () => showSection('adminSection'));
  }
  
  if (document.getElementById('gdprNav')) {
    document.getElementById('gdprNav').addEventListener('click', () => {
      showSection('gdprSection');
      if (contract) loadRequestHistory();
    });
  }
  
  if (document.getElementById('dpoNav')) {
    document.getElementById('dpoNav').addEventListener('click', () => {
      showSection('dpoSection');
      if (contract) loadDPODashboard();
    });
  }
  
  if (document.getElementById('backToCaseList')) {
    document.getElementById('backToCaseList').addEventListener('click', () => showSection('casesSection'));
  }
  
  // Register case form
  if (document.getElementById('registerCaseForm')) {
    document.getElementById('registerCaseForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const caseTitle = document.getElementById('caseTitle').value;
      const caseDescription = document.getElementById('caseDescription').value;
      const initialDocIpfs = document.getElementById('initialDocumentIpfs').value;
      const dataClassification = document.getElementById('dataClassification').value;
      const caseType = parseInt(document.getElementById('caseType').value);
      const requiresEncryption = document.getElementById('requiresEncryption').checked;
      const retentionPeriod = parseInt(document.getElementById('retentionPeriod').value);
      const legalBasis = document.getElementById('legalBasis').value;
      
      registerCase(caseTitle, caseDescription, initialDocIpfs, dataClassification, caseType, requiresEncryption, retentionPeriod, legalBasis);
    });
  }
  
  // Admin buttons
  if (document.getElementById('addJudgeBtn')) {
    document.getElementById('addJudgeBtn').addEventListener('click', function() {
      const judgeAddress = document.getElementById('newJudgeAddress').value;
      if (judgeAddress) {
        addJudge(judgeAddress);
      } else {
        showAlert("Error", "Please enter a judge address");
      }
    });
  }
  
  if (document.getElementById('addDPOBtn')) {
    document.getElementById('addDPOBtn').addEventListener('click', function() {
      const dpoAddress = document.getElementById('newDPOAddress').value;
      if (dpoAddress) {
        addDPO(dpoAddress);
      } else {
        showAlert("Error", "Please enter a DPO address");
      }
    });
  }
  
  // Submit document button
  if (document.getElementById('submitDocumentBtn')) {
    document.getElementById('submitDocumentBtn').addEventListener('click', function() {
      const ipfsHash = document.getElementById('documentIpfsHash').value;
      const documentType = document.getElementById('newDocumentType').value;
      const encryptionKey = document.getElementById('encryptionKey').value;
      const isEncrypted = document.getElementById('isEncrypted').checked;
      
      if (ipfsHash && documentType && currentCaseId) {
        submitDocument(currentCaseId, ipfsHash, documentType, encryptionKey, isEncrypted);
      } else {
        showAlert("Error", "Please fill in all required fields");
      }
    });
  }
  
  // Assign judge button (in case details)
  if (document.getElementById('assignJudgeBtn')) {
    document.getElementById('assignJudgeBtn').addEventListener('click', function() {
      const judgeAddress = document.getElementById('judgeAddressInput').value;
      if (judgeAddress && currentCaseId) {
        assignJudge(currentCaseId, judgeAddress);
      } else {
        showAlert("Error", "Please enter a case reviewer address");
      }
    });
  }
  
  // Schedule hearing button
  if (document.getElementById('scheduleHearingBtn')) {
    document.getElementById('scheduleHearingBtn').addEventListener('click', function() {
      const hearingDateInput = document.getElementById('hearingDateInput').value;
      if (hearingDateInput && currentCaseId) {
        const hearingTimestamp = Math.floor(new Date(hearingDateInput).getTime() / 1000);
        scheduleHearing(currentCaseId, hearingTimestamp);
      } else {
        showAlert("Error", "Please select a meeting date");
      }
    });
  }
  
  // Update case status button
  if (document.getElementById('updateStatusBtn')) {
    document.getElementById('updateStatusBtn').addEventListener('click', function() {
      const statusCode = document.getElementById('caseStatusSelect').value;
      if (statusCode && currentCaseId) {
        updateCaseStatus(currentCaseId, statusCode);
      } else {
        showAlert("Error", "Please select a status");
      }
    });
  }
  
  // Revoke encryption key button (DPO function)
  if (document.getElementById('revokeKeyBtn')) {
    document.getElementById('revokeKeyBtn').addEventListener('click', function() {
      const caseId = parseInt(document.getElementById('revokeKeyCase').value);
      const keyHash = document.getElementById('revokeKeyHash').value;
      
      if (caseId && keyHash) {
        revokeEncryptionKey(caseId, keyHash);
      } else {
        showAlert("Error", "Please fill in all fields");
      }
    });
  }
  
  // Data subject request button
  if (document.getElementById('dataSubjectRequestBtn')) {
    document.getElementById('dataSubjectRequestBtn').addEventListener('click', function() {
      const requestType = parseInt(document.getElementById('requestType').value);
      const requestDetails = document.getElementById('requestDetails').value;
      
      if (requestDetails && currentCaseId) {
        createDataSubjectRequest(currentCaseId, requestType, requestDetails);
      } else {
        showAlert("Error", "Please view a case first, then submit request");
      }
    });
  }
  
  // Request history refresh
  if (document.getElementById('refreshRequestHistory')) {
    document.getElementById('refreshRequestHistory').addEventListener('click', function() {
      if (contract) loadRequestHistory();
    });
  }
  
  // DPO functions
  if (document.getElementById('processRequestBtn')) {
    document.getElementById('processRequestBtn').addEventListener('click', function() {
      const requestId = parseInt(document.getElementById('requestIdInput').value);
      const status = parseInt(document.getElementById('requestStatusSelect').value);
      const responseDetails = document.getElementById('responseDetails').value;
      
      if (requestId && responseDetails) {
        processDataSubjectRequest(requestId, status, responseDetails);
      } else {
        showAlert("Error", "Please fill in all fields");
      }
    });
  }
  
  // Admin system functions
  if (document.getElementById('archiveExpiredBtn')) {
    document.getElementById('archiveExpiredBtn').addEventListener('click', function() {
      if (confirm("Archive all expired cases?")) {
        archiveExpiredCases();
      }
    });
  }
  
  if (document.getElementById('generateROPABtn')) {
    document.getElementById('generateROPABtn').addEventListener('click', generateROPAReport);
  }
  
  if (document.getElementById('generateDPIATemplate')) {
    document.getElementById('generateDPIATemplate').addEventListener('click', generateDPIATemplate);
  }
  
  // Account change listener
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== currentAccount) {
        connectWallet();
      }
    });
  }
  
  console.log("✅ GDPR Case Management System Ready!");
  console.log("🔗 Click 'Connect Wallet' to begin");
  
  if (contractAddress === "0xYOUR_CONTRACT_ADDRESS_HERE") {
    console.warn("⚠️ Please update the contract address in the JavaScript file!");
  }
});