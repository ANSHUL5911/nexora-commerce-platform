import robot from '../assets/robot.png';
import user from '../assets/user.png';
import './ChatMessage.css';



export function ChatMessage({ message, sender }) {
    // const message = props.message;
    // const sender = props.sender;
    // const {message, sender} = props;
    /*
    if (sender === 'robot') {
        return (
            <div>
                <img src="robot.png" width="50" />
                {message}
            </div>
        );
    }
    */
  
    return (
        <div className={sender === 'user' ? 'chat-message-user' : 'chat-message-robot'}>
            {sender === 'robot' && <img src={robot} className="chat-message-profile" />}
  
            <div className="chat-message-text">
                {message}
            </div>
  
            {sender === 'user' && <img src={user} className="chat-message-profile" />}
        </div>
    );
  }
  
  // To use a function as a hook, the function name must
  // start with "use".
  
  
  
  