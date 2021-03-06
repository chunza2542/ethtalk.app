import React, { useState, useCallback, useEffect } from "react";
import { Comment, CommentEditor } from "./index";
import WalletConnectProvider from "@walletconnect/web3-provider";
import Web3Modal from "web3modal";
import styled from "styled-components";
import Icon, { CopyOutlined, FileDoneOutlined, LinkOutlined, LogoutOutlined } from "@ant-design/icons";
import { Menu, Dropdown, Divider } from "antd";
import MetaMaskIconSVG from "../assets/metamask.svg";
import UnstoppableSVG from "../assets/unstoppable.svg";
import WalletConnectIconSVG from "../assets/walletconnect.svg";
import BurnerWalletIconPNG from "../assets/burner-wallet.png";
import { Button } from "./Button";
import { useUserSigner } from "../hooks";
import { INFURA_ID, NETWORKS } from "../constants";
import { firebaseLogin,firebaseLoginWithUnstoppable } from "../utils/auth";
import { auth, firestore } from "../utils/firebase";
import { signInWithCustomToken, signOut } from "@firebase/auth";
import { collection, query, orderBy, onSnapshot, doc, setDoc, addDoc, getDoc } from "@firebase/firestore";
import useFirebaseAuth from "../hooks/FirebaseAuth";
import { copyToClipboard, hashURL } from "../utils/helper";
import Address from "./Address";
import Blockie from "./Blockie";
import { useAuth } from "../hooks/UnstoppableAuth";
const ethers = require("ethers");

const DropdownItem = styled.div`
  display: flex;
  align-items: center;

  & svg {
    margin-right: 7px;
  }

  ${props =>
    props.disabled
      ? `
      cursor: not-allowed;
      opacity: 0.5;
  `
      : ""}
`;
const PanelContainer = styled.div`
  display: flex;
  align-items: center;
`;
const Profile = styled.div`
  cursor: pointer;
  border: 1px solid #ccc;
  border-radius: 3px;
  margin-right: 5px;
  display: flex;
  align-items: center;
  padding: 2px;

  & canvas {
    width: 25px;
    height: 25px;
    border-radius: 3px;
  }
`;
const MetaMaskIcon = () => (
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <image href={MetaMaskIconSVG} height="20" width="20" />
  </svg>
);
const UnstoppableIcon = () => (
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <image href={UnstoppableSVG} height="20" width="20" />
  </svg>
);
const WalletConnectIcon = () => (
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <image href={WalletConnectIconSVG} height="20" width="20" />
  </svg>
);
const BurnerWalletIcon = () => (
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <image href={BurnerWalletIconPNG} height="20" width="20" />
  </svg>
);

/*
  Web3 modal helps us "connect" external wallets:
*/
const web3Modal = new Web3Modal({
  network: "mainnet",
  cacheProvider: true,
  theme: "light",
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        bridge: "https://polygon.bridge.walletconnect.org",
        infuraId: INFURA_ID,
        rpc: {
          1: `https://mainnet.infura.io/v3/${INFURA_ID}`,
          100: "https://dai.poa.network",
        },
      },
    },
  },
});

const targetNetwork = NETWORKS.mainnet;
const localProviderUrl = targetNetwork.rpcUrl;
const localProviderUrlFromEnv = process.env.REACT_APP_PROVIDER ? process.env.REACT_APP_PROVIDER : localProviderUrl;
const localProvider = new ethers.providers.StaticJsonRpcProvider(localProviderUrlFromEnv);

const CommentWidget = ({ commentURL }) => {
  const [comments, setComments] = useState([]);
  const [injectedProvider, setInjectedProvider] = useState();
  const userSigner = useUserSigner(injectedProvider, localProvider);
  const { publicAddress } = useFirebaseAuth();
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#4b47ee");
  const unstoppableAuth = useAuth();
  // load all comments
  useEffect(() => {
    const commentCollectionRef = collection(firestore, "comment-boxes", hashURL(commentURL), "comments");
    const q = query(commentCollectionRef, orderBy("createdAt", "asc"));

    onSnapshot(q, snapshot => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  // Sign in with Firebase custom token
  const signInWithEthereum = async () => {
    setIsLoading(true);
    try {
      const customToken = await firebaseLogin(userSigner);
      await signInWithCustomToken(auth, customToken);
      setError("");
    } catch (e) {
      setError(e.message);
    }
    setIsLoading(false);
  };
  async function loginWithUnstoppable() {
    setIsLoading(true);
    try {
      const authorization=await unstoppableAuth.signin();
      const customToken = await firebaseLoginWithUnstoppable(authorization?.idToken?.sub);
      await signInWithCustomToken(auth, customToken);
      setError("");
    } catch (e) {
      console.log(e.message)
      unstoppableAuth.signout()
      setIsLoading(false);
    }
    setIsLoading(false);


  }
  useEffect(() => {
    if (injectedProvider !== undefined && userSigner !== undefined) {
      signInWithEthereum();
    }
  }, [injectedProvider, userSigner]);

  const signOutOfWeb3Modal = async () => {
    await web3Modal.clearCachedProvider();
    if (injectedProvider && injectedProvider.provider && typeof injectedProvider.provider.disconnect == "function") {
      await injectedProvider.provider.disconnect();
    }
    // Sign out from Firebase
    signOut(auth);
    setError("");
  };

  const loadWeb3Modal = useCallback(
    async providerName => {
      const provider = await web3Modal.connectTo(providerName);
      setInjectedProvider(new ethers.providers.Web3Provider(provider));

      // Subscribe to session disconnection
      provider.on("disconnect", () => {
        signOutOfWeb3Modal();
      });
    },
    [setInjectedProvider],
  );

  const handleSubmit = async () => {
    setError("");

    if (!value.trim()) return;
    if (value.length > 2000) {
      setError("character limit exceeded (maximum: 2000 characters)");
      return;
    }

    setIsLoading(true);
    try {
      const commentBoxRef = doc(firestore, "comment-boxes", hashURL(commentURL));
      const commentBox = await getDoc(commentBoxRef);
      if (!commentBox.exists()) {
        await setDoc(commentBoxRef, {
          commentURL,
          createdAt: new Date(),
        });
      }
      const commentRef = collection(firestore, "comment-boxes", hashURL(commentURL), "comments");
      await addDoc(commentRef, {
        data: value.trim(),
        likes: [],
        authorPublicAddress: publicAddress,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setValue("");
    } catch (e) {
      setError(e.message);
    }
    setIsLoading(false);
  };
  const unstoppableStyle = { backgroundColor, color: "white" }

  const signInOptions = (
    <Menu>
      <Menu.Item key="0" style={unstoppableStyle} >
        <DropdownItem
          disabled={!window.ethereum}
          backgroundColor={'#4b47ee'}
          onMouseEnter={() => setBackgroundColor("#0b24b3")}
          onMouseLeave={() => setBackgroundColor("#4b47ee")}
          onMouseDown={() => setBackgroundColor('#5361c7')}
          onMouseUp={() => setBackgroundColor("#4b47ee")}
          onClick={loginWithUnstoppable}
        >
          <Icon component={UnstoppableIcon} />
          <div>Login with Unstoppable</div>
        </DropdownItem>
      </Menu.Item>
      <Menu.Item key="1">
        <DropdownItem
          onClick={() => {
            if (window.ethereum) {
              loadWeb3Modal("injected");
            }
          }}
          disabled={!window.ethereum}
        >
          <Icon component={MetaMaskIcon} />
          <div>Connect with MetaMask</div>
        </DropdownItem>
      </Menu.Item>
      <Menu.Item key="2">
        <DropdownItem disabled>
          <Icon component={WalletConnectIcon} />
          <div>Connect with WalletConnect</div>
        </DropdownItem>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        key="burner"
        onClick={() => {
          setInjectedProvider(null);
        }}
      >
        <DropdownItem>
          <Icon component={BurnerWalletIcon} />
          <div>Connect with a Burner Wallet</div>
        </DropdownItem>
      </Menu.Item>
    </Menu>
  );
  const profileUnstoppable = (
    <Menu>
      <Menu.Item key="address">
        <DropdownItem disabled>
          {unstoppableAuth.user?.idToken?.sub}

        </DropdownItem>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        key="0"
        onClick={() => {
          copyToClipboard(unstoppableAuth.user?.idToken?.sub);
        }}
      >
        <DropdownItem>
          <CopyOutlined />
          <div>Copy Unstoppable Domain to Clipboard</div>
        </DropdownItem>
      </Menu.Item>
      <Menu.Item key="1">
        <a target="_blank" href={`https://etherscan.io/address/${unstoppableAuth.user?.idToken?.wallet_address}`}>
          <DropdownItem>
            <LinkOutlined />
            <div>Open in Etherscan</div>
          </DropdownItem>
        </a>
      </Menu.Item>

      <Menu.Divider />
      <Menu.Item
        danger
        key="signout"
        onClick={() => {
          unstoppableAuth.signout()
          signOut(auth);
          setError("");
        }}
      >
        <DropdownItem>
          <Icon component={LogoutOutlined} />
          <div>Sign Out</div>
        </DropdownItem>
      </Menu.Item>
    </Menu>
  );
  const profileOptions = (
    <Menu>
      <Menu.Item key="address">
        <DropdownItem disabled>
          <Address address={publicAddress} />
        </DropdownItem>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        key="0"
        onClick={() => {
          copyToClipboard(publicAddress);
        }}
      >
        <DropdownItem>
          <CopyOutlined />
          <div>Copy Address to Clipboard</div>
        </DropdownItem>
      </Menu.Item>
      <Menu.Item key="1">
        <a target="_blank" href={`https://etherscan.io/address/${publicAddress}`}>
          <DropdownItem>
            <LinkOutlined />
            <div>Open in Etherscan</div>
          </DropdownItem>
        </a>
      </Menu.Item>
      <Menu.Item key="2">
        <a target="_blank" href="https://app.ens.domains/">
          <DropdownItem>
            <FileDoneOutlined />
            <div>Register ENS Domain</div>
          </DropdownItem>
        </a>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item
        danger
        key="signout"
        onClick={() => {
          signOutOfWeb3Modal();
        }}
      >
        <DropdownItem>
          <Icon component={LogoutOutlined} />
          <div>Sign Out</div>
        </DropdownItem>
      </Menu.Item>
    </Menu>
  );

  const commentEditorFooter = (
    <>

      {(!publicAddress && !unstoppableAuth.user) && (
        <Dropdown overlay={isLoading ? <div /> : signInOptions} trigger={["click"]} placement="topRight">
          <Button loading={isLoading}>Sign in with Ethereum</Button>
        </Dropdown>
      )}
      {(unstoppableAuth.user && publicAddress) && (
        <PanelContainer>
          <Dropdown overlay={profileUnstoppable} trigger={["click"]} placement="topRight">
            <Profile>
              <Blockie address={unstoppableAuth.user?.idToken?.wallet_address} size={7} />
            </Profile>
          </Dropdown>
          <Button loading={isLoading} onClick={isLoading ? () => { } : handleSubmit}>
            Comment
          </Button>
        </PanelContainer>
      )}
      {(publicAddress && !unstoppableAuth.user) && (
        <PanelContainer>
          <Dropdown overlay={profileOptions} trigger={["click"]} placement="topRight">
            <Profile>
              <Blockie address={publicAddress} size={7} />
            </Profile>
          </Dropdown>
          <Button loading={isLoading} onClick={isLoading ? () => { } : handleSubmit}>
            Comment
          </Button>
        </PanelContainer>
      )}
    </>
  );

  return (
    <>
      <h3>{comments.length} comments</h3>
      <div style={{ marginTop: 24 }}>
        {comments.map((comment, i) => {
          return <Comment commentURL={commentURL} {...comment} key={`comment_${i}`} />;
        })}
      </div>
      <Divider />

      <CommentEditor
        footer={commentEditorFooter}
        error={error}
        value={value}
        onChange={setValue}
        placeholder="Write a comment..."
        loading={(!publicAddress && !unstoppableAuth.user) || isLoading }
      />
    </>
  );
};

export default CommentWidget;
